import pytest

from tts.factory import load_engine


def test_missing_engine_cannot_silently_replace_the_voice(monkeypatch):
    monkeypatch.delenv("TTS_ENGINE", raising=False)
    with pytest.raises(ValueError, match="TTS_ENGINE"):
        load_engine()


def test_invalid_engine_fails_before_loading_weights(monkeypatch):
    monkeypatch.setenv("TTS_ENGINE", "unknown")
    with pytest.raises(ValueError, match="TTS_ENGINE"):
        load_engine()
