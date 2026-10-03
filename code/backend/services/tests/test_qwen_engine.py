import base64
import hashlib
import json

import numpy as np
import pytest

from speech_runtime.contracts import Execute
from tts.factory import load_engine
from tts.qwen.engine import QwenEngine
from tts.qwen.reference_context import read_transcript


def test_unknown_engine_fails_without_loading_models(monkeypatch):
    monkeypatch.setenv("TTS_ENGINE", "unknown")

    with pytest.raises(ValueError, match="TTS_ENGINE"):
        load_engine()


def test_reference_context_rejects_stale_or_missing_transcript(tmp_path):
    reference = tmp_path / "test.wav"

    with pytest.raises(ValueError, match="sidecar"):
        read_transcript(reference, "current-hash")

    reference.with_suffix(".json").write_text(
        json.dumps({"referenceSha256": "old-hash", "transcript": "Text"})
    )

    with pytest.raises(ValueError, match="different reference"):
        read_transcript(reference, "current-hash")


def test_qwen_context_cache_is_invalidated_when_reference_changes(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("VOICE_REFERENCE_DIRECTORY", str(tmp_path))
    reference = tmp_path / "test.wav"
    prompts = []

    class Model:
        def create_voice_clone_prompt(self, **options):
            prompts.append(options)
            return options

        def generate_voice_clone(self, **options):
            assert options["language"] == "Portuguese"
            assert options["non_streaming_mode"] is True
            assert options["max_new_tokens"] == 512
            return [np.zeros(2400, dtype=np.float32)], 24000

    engine = QwenEngine.__new__(QwenEngine)
    engine.model = Model()
    engine.config = object()
    monkeypatch.setattr(
        "tts.qwen.engine.synthesize",
        lambda model, text, prompt, config: model.generate_voice_clone(
            text=text,
            language="Portuguese",
            voice_clone_prompt=prompt,
            non_streaming_mode=True,
            max_new_tokens=512,
        ),
    )
    engine._prompt_key = engine._prompt = None

    def request(audio, transcript):
        reference.write_bytes(audio)
        sha = hashlib.sha256(audio).hexdigest()
        reference.with_suffix(".json").write_text(
            json.dumps({"referenceSha256": sha, "transcript": transcript})
        )
        return Execute(
            protocolVersion="1.0",
            role="tts",
            content="Test",
            dataClass="synthetic",
            maxTokens=1000,
            voice={
                "id": "00000000-0000-0000-0000-000000000000",
                "referenceFile": reference.name,
                "referenceSha256": sha,
            },
        )

    data = request(b"first audio", "First transcript")
    first = engine.execute(data)
    engine.execute(data)
    assert len(prompts) == 1
    assert engine._timings["referenceContextReused"] is True
    assert len(base64.b64decode(first["audio"]["pcmBase64"])) == 3200

    engine.execute(request(b"new audio", "New transcript"))
    assert len(prompts) == 2
    assert engine._timings["referenceContextReused"] is False
    assert prompts[-1]["ref_text"] == "New transcript"

    # A stale API profile cannot silently reuse the previous voice context.
    with pytest.raises(ValueError, match="changed after activation"):
        engine.execute(data)


def test_startup_prepares_reference_before_first_user_request(monkeypatch, tmp_path):
    from tts.qwen import engine as module
    from tts.qwen.config import QwenConfig

    reference = tmp_path / "test.wav"
    reference.write_bytes(b"reference")
    sha = hashlib.sha256(reference.read_bytes()).hexdigest()
    reference.with_suffix(".json").write_text(
        json.dumps({"referenceSha256": sha, "transcript": "Test reference"})
    )
    monkeypatch.setenv("VOICE_REFERENCE_DIRECTORY", str(tmp_path))
    prepared = []

    class Model:
        def create_voice_clone_prompt(self, **options):
            prepared.append(options)
            return options

        def generate_voice_clone(self, **options):
            return [np.zeros(2400, dtype=np.float32)], 24000

    monkeypatch.setattr(module, "load_model", lambda _: Model())
    monkeypatch.setattr(
        QwenConfig,
        "from_environment",
        lambda: QwenConfig(tmp_path, "cpu", False, "test.wav"),
    )
    engine = QwenEngine()
    assert len(prepared) == 1
    assert engine._timings == {}
    request = Execute(
        protocolVersion="1.0",
        role="tts",
        content="New user text",
        dataClass="synthetic",
        maxTokens=1,
        voice={
            "id": "00000000-0000-0000-0000-000000000000",
            "referenceFile": "test.wav",
            "referenceSha256": sha,
        },
    )
    engine.execute(request)
    assert len(prepared) == 1
    assert engine._timings["referenceContextReused"] is True


def test_synthesis_resets_approved_seed_and_restores_rng(monkeypatch):
    import sys
    from contextlib import contextmanager
    from types import SimpleNamespace

    from tts.qwen.synthesis import synthesize

    events = []

    @contextmanager
    def fork_rng(*, devices):
        events.append(("enter", devices))
        try:
            yield
        finally:
            events.append(("restore", devices))

    monkeypatch.setitem(
        sys.modules,
        "torch",
        SimpleNamespace(
            random=SimpleNamespace(fork_rng=fork_rng),
            manual_seed=lambda seed: events.append(("seed", seed)),
        ),
    )

    class Model:
        def generate_voice_clone(self, **options):
            assert options["language"] == "Portuguese"
            assert options["non_streaming_mode"] is True
            events.append(("generate", options["text"]))
            return [np.zeros(2400)], 24000

    synthesize(
        Model(), "Frase de teste.", [], SimpleNamespace(device="cuda:0", seed=42)
    )
    assert events == [
        ("enter", [0]),
        ("seed", 42),
        ("generate", "Frase de teste."),
        ("restore", [0]),
    ]
