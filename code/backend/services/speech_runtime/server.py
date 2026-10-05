import asyncio
import logging
import os
from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .contracts import Execute
from .errors import NoSpeechDetected
from .inference import await_inference
from .security import SpeechSecurityMiddleware


def create_service(role: str, loader: Callable, custom_voice: bool = False):
    """HTTP transport: loads one engine and serializes expensive inference."""
    token = os.environ.get("SERVICE_ACCESS_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("SERVICE_ACCESS_TOKEN must contain at least 32 characters")
    engine = None
    busy = False
    waiting = 0
    failures = {}
    inference_lock = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(_app):
        nonlocal engine
        engine = await asyncio.to_thread(loader)
        yield
        engine = None

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    app.add_middleware(SpeechSecurityMiddleware, token=token)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(_request, error):
        return JSONResponse(
            status_code=422,
            content={
                "code": "INVALID_INPUT",
                "issues": [
                    {"location": list(issue["loc"]), "type": issue["type"]}
                    for issue in error.errors()
                ],
            },
        )

    @app.exception_handler(Exception)
    async def unexpected(_request, _error):
        return JSONResponse(status_code=503, content={"code": "INFERENCE_UNAVAILABLE"})

    @app.get("/health")
    async def health():
        if engine is None:
            raise HTTPException(503, "Engine not loaded")
        return {
            "protocolVersion": "1.0",
            "role": role,
            "status": "ok",
            "capabilities": {
                "incrementalGeneration": False,
                "progressiveDelivery": False,
                "vision": False,
                "customVoice": custom_voice,
                "testedVoiceControls": [],
            },
        }

    @app.get("/metrics")
    async def metrics():
        import psutil

        values = {
            "role": role,
            "residentMemoryBytes": psutil.Process().memory_info().rss,
            "busy": busy,
            "queuedInferences": waiting,
            "failureReasons": dict(failures),
        }
        if engine is not None and hasattr(engine, "metrics"):
            values.update(engine.metrics())
        return values

    @app.post("/execute")
    async def execute(data: Execute, request: Request):
        nonlocal busy, waiting
        if data.role != role or engine is None:
            raise HTTPException(400, "Role or engine invalid")

        # Reserve admission before awaiting anything: one inference owner and
        # at most one waiter, including requests checking for disconnection.
        if int(busy) + waiting >= 2:
            raise HTTPException(429, "Inference queue full")

        waiting += 1
        try:
            while True:
                if await request.is_disconnected():
                    return Response(status_code=499)
                try:
                    await asyncio.wait_for(inference_lock.acquire(), timeout=0.1)
                    break
                except TimeoutError:
                    continue
        finally:
            waiting -= 1

        busy = True
        # Cancellation of an HTTP client cannot interrupt a GPU kernel. Keep
        # ownership until the thread finishes; stale output is discarded by API.
        task = None
        try:
            # A canceled waiter must never start another obsolete inference.
            if await request.is_disconnected():
                return Response(status_code=499)
            task = asyncio.create_task(asyncio.to_thread(engine.execute, data))
            return await await_inference(task)
        except NoSpeechDetected:
            return JSONResponse(status_code=422, content={"code": "NO_SPEECH_DETECTED"})
        except ValueError as error:
            failures["INVALID_INPUT"] = failures.get("INVALID_INPUT", 0) + 1
            logging.getLogger(__name__).error(
                "%s input failure (%s)", role, type(error).__name__
            )
            raise HTTPException(400, "Invalid speech input") from None
        except Exception as error:  # noqa: BLE001 - sanitize errors from third-party engines
            code = (
                "RESOURCE_EXHAUSTED"
                if type(error).__name__ == "OutOfMemoryError"
                else "INFERENCE_UNAVAILABLE"
            )
            failures[code] = failures.get(code, 0) + 1
            logging.getLogger(__name__).error(
                "%s inference failure (%s)", role, type(error).__name__
            )
            raise HTTPException(503, "Inference unavailable") from None
        finally:
            busy = False
            inference_lock.release()

    return app
