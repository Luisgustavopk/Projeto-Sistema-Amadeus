import base64
import hashlib

import pytest
from fastapi.testclient import TestClient
from speech_runtime.contracts import Execute, Voice
from speech_runtime.server import create_service
from stt.engine import WhisperEngine
from tts.reference import resolve_reference

TOKEN = "test-only-credential-of-more-than-32-characters"
HEADERS = {"authorization": "Bearer " + TOKEN}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SERVICE_ACCESS_TOKEN", TOKEN)

    class Engine:
        def execute(self, data):
            if data.content == "failure":
                raise RuntimeError("private file path or secret")
            return {"content": "teste", "inputTokens": None, "outputTokens": None}

    with TestClient(create_service("stt", Engine)) as value:
        yield value


def payload(**extra):
    return {
        "protocolVersion": "1.0",
        "role": "stt",
        "model": None,
        "content": "",
        "dataClass": "synthetic",
        "maxTokens": 1000,
        **extra,
    }


def test_authentication_and_health(client):
    assert client.get("/health").status_code == 401
    assert (
        client.get("/health", headers=HEADERS).json()["capabilities"]["customVoice"]
        is False
    )


def test_valid_request_and_strict_validation(client):
    assert client.post("/execute", json=payload(), headers=HEADERS).status_code == 200
    assert (
        client.post(
            "/execute", json=payload(extra="invalid"), headers=HEADERS
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/execute", json=payload(maxTokens="1"), headers=HEADERS
        ).status_code
        == 422
    )
    assert (
        client.post("/execute", json=payload(role="tts"), headers=HEADERS).status_code
        == 400
    )


def test_global_errors_do_not_expose_private_details(client):
    response = client.post("/execute", json=payload(content="failure"), headers=HEADERS)
    assert response.status_code == 503
    assert "private" not in response.text


def test_body_limit(client):
    assert (
        client.post("/execute", content=b"x" * 1400001, headers=HEADERS).status_code
        == 413
    )


def test_reference_integrity_and_directory(monkeypatch, tmp_path):
    monkeypatch.setenv("VOICE_REFERENCE_DIRECTORY", str(tmp_path))
    file = tmp_path / "original.wav"
    file.write_bytes(b"original")
    voice = Voice(
        id="00000000-0000-0000-0000-000000000000",
        referenceFile="original.wav",
        referenceSha256=hashlib.sha256(b"original").hexdigest(),
    )
    assert resolve_reference(voice) == file
    file.write_bytes(b"changed")
    with pytest.raises(ValueError):
        resolve_reference(voice)


def test_stt_pcm_validation_and_language():
    class Segment:
        text = " Olá "

    class Model:
        def transcribe(self, samples, **options):
            assert samples.shape == (1600,)
            assert options["language"] == "pt"
            assert options["vad_filter"] is True
            assert options["beam_size"] == 1
            return [Segment()], None

    engine = WhisperEngine.__new__(WhisperEngine)
    engine.model = Model()
    data = Execute(
        **payload(
            audio={
                "pcmBase64": base64.b64encode(b"\x00" * 3200).decode(),
                "sampleRate": 16000,
                "channels": 1,
            }
        )
    )
    assert engine.execute(data)["content"] == "Olá"
    assert engine.metrics()["engine"] == "faster-whisper"
    assert engine.metrics()["audioSeconds"] == 0.1
    assert engine.metrics()["realTimeFactor"] >= 0

    class FailingModel:
        def transcribe(self, _samples, **_options):
            raise RuntimeError("inference failed")

    engine.model = FailingModel()
    with pytest.raises(RuntimeError, match="inference failed"):
        engine.execute(data)
    assert engine.metrics()["transcriptionSeconds"] >= 0
    data.audio.pcmBase64 = "!!!!"
    with pytest.raises(ValueError):
        engine.execute(data)


def test_service_requires_secret(monkeypatch):
    monkeypatch.delenv("SERVICE_ACCESS_TOKEN", raising=False)
    with pytest.raises(RuntimeError):
        create_service("stt", lambda: None)


def test_inference_has_one_owner_even_with_concurrent_requests(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from time import monotonic, sleep

    monkeypatch.setenv("SERVICE_ACCESS_TOKEN", TOKEN)
    entered, release = Event(), Event()
    calls = 0

    class BlockingEngine:
        def execute(self, _data):
            nonlocal calls
            calls += 1

            if calls == 1:
                entered.set()
                assert release.wait(3)

            return {"content": "ok", "inputTokens": None, "outputTokens": None}

    with (
        TestClient(create_service("stt", BlockingEngine)) as client,
        ThreadPoolExecutor(max_workers=2) as pool,
    ):
        pending = pool.submit(client.post, "/execute", json=payload(), headers=HEADERS)
        try:
            assert entered.wait(2)
            queued = pool.submit(
                client.post, "/execute", json=payload(), headers=HEADERS
            )
            deadline = monotonic() + 2
            while (
                client.get("/metrics", headers=HEADERS).json()["queuedInferences"]
                != 1
                and monotonic() < deadline
            ):
                sleep(0.01)
            assert client.get("/metrics", headers=HEADERS).json()[
                "queuedInferences"
            ] == 1
            assert (
                client.post("/execute", json=payload(), headers=HEADERS).status_code
                == 429
            )
        finally:
            release.set()
        assert pending.result().status_code == 200
        assert queued.result().status_code == 200
        assert calls == 2


def test_tts_requires_original_reference_and_returns_pcm(monkeypatch, tmp_path):
    import numpy as np
    from tts.config import SynthesisConfig
    from tts.engine import ChatterboxEngine

    monkeypatch.setenv("VOICE_REFERENCE_DIRECTORY", str(tmp_path))
    file = tmp_path / "original.wav"
    file.write_bytes(b"authorized-test-reference")

    class Tensor:
        def detach(self):
            return self

        def cpu(self):
            return self

        def numpy(self):
            return np.array([0, 0.5, -0.5, 1.1], dtype=np.float32)

    class Model:
        sr = 16000

        def generate(self, text, **options):
            assert text == "Olá"
            assert options["language_id"] == "pt"
            assert options["audio_prompt_path"] == str(file)
            return Tensor()

    engine = ChatterboxEngine.__new__(ChatterboxEngine)
    engine.model = Model()
    engine.synthesis = SynthesisConfig(0.3, 0.5, 0.65)
    data = Execute(
        **payload(
            role="tts",
            content="Olá",
            voice={
                "id": "00000000-0000-0000-0000-000000000000",
                "referenceFile": file.name,
                "referenceSha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            },
        )
    )
    result = engine.execute(data)
    assert result["audio"]["sampleRate"] == 16000
    assert len(base64.b64decode(result["audio"]["pcmBase64"])) == 8
    data.voice = None
    with pytest.raises(ValueError):
        engine.execute(data)


def test_valid_audio_without_speech_is_an_expected_outcome(monkeypatch):
    from speech_runtime.errors import NoSpeechDetected

    monkeypatch.setenv("SERVICE_ACCESS_TOKEN", TOKEN)

    class SilentEngine:
        def execute(self, _data):
            raise NoSpeechDetected()

    with TestClient(create_service("stt", SilentEngine)) as client:
        response = client.post("/execute", json=payload(), headers=HEADERS)
        assert response.status_code == 422
        assert response.json() == {"code": "NO_SPEECH_DETECTED"}


def test_disconnected_waiter_never_starts_obsolete_inference(monkeypatch):
    import asyncio
    from threading import Event

    monkeypatch.setenv("SERVICE_ACCESS_TOKEN", TOKEN)
    entered, release = Event(), Event()
    calls = []

    class Engine:
        def execute(self, data):
            calls.append(data.content)
            if len(calls) == 1:
                entered.set()
                assert release.wait(3)
            return {"content": "ok", "inputTokens": None, "outputTokens": None}

    class Connection:
        disconnected = False

        async def is_disconnected(self):
            return self.disconnected

    async def exercise():
        app = create_service("stt", Engine)
        async with app.router.lifespan_context(app):
            execute = next(route.endpoint for route in app.routes if route.path == "/execute")
            metrics = next(route.endpoint for route in app.routes if route.path == "/metrics")
            first = asyncio.create_task(execute(Execute(**payload(content="first")), Connection()))
            stale_connection = Connection()
            try:
                assert await asyncio.to_thread(entered.wait, 2)
                stale = asyncio.create_task(execute(Execute(**payload(content="stale")), stale_connection))
                await asyncio.sleep(0.02)
                assert (await metrics())["queuedInferences"] == 1
                stale_connection.disconnected = True
                assert (await asyncio.wait_for(stale, timeout=1)).status_code == 499
                assert calls == ["first"]
                assert (await metrics())["queuedInferences"] == 0
                current = asyncio.create_task(execute(Execute(**payload(content="current")), Connection()))
                release.set()
                await first
                await current
                assert calls == ["first", "current"]
                assert (await metrics())["busy"] is False
                assert (await metrics())["queuedInferences"] == 0
            finally:
                release.set()
                await first

    asyncio.run(exercise())
