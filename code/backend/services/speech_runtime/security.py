import hmac

from starlette.responses import JSONResponse


class SpeechSecurityMiddleware:
    """Authenticate and bound ASGI request bodies before DTO parsing."""

    def __init__(self, app, token: str):
        self.app = app
        self.expected = ("Bearer " + token).encode("utf-8")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        if not hmac.compare_digest(headers.get(b"authorization", b""), self.expected):
            await JSONResponse({"code": "UNAUTHORIZED"}, status_code=401)(
                scope, receive, send
            )
            return
        if scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > 1400000:
                await JSONResponse({"code": "PAYLOAD_TOO_LARGE"}, status_code=413)(
                    scope, receive, send
                )
                return
            if not message.get("more_body", False):
                break
        consumed = False

        async def replay():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
