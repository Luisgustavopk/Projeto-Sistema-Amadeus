import pytest

from stt.config import SttConfig


def test_default_decoding_compares_three_candidates(monkeypatch):
    monkeypatch.delenv("STT_BEAM_SIZE", raising=False)
    assert SttConfig.from_environment().beam_size == 3


@pytest.mark.parametrize("value", ["0", "6", "1.5", "fast", ""])
def test_rejects_invalid_decoding_configuration(monkeypatch, value):
    monkeypatch.setenv("STT_BEAM_SIZE", value)
    with pytest.raises(ValueError, match="STT_BEAM_SIZE"):
        SttConfig.from_environment()


@pytest.mark.parametrize("value", [1, 3, 5])
def test_decoding_can_be_tuned_without_changing_model(monkeypatch, value):
    monkeypatch.setenv("STT_BEAM_SIZE", str(value))
    assert SttConfig.from_environment().beam_size == value


def test_vad_and_vocabulary_are_explicit_and_bounded(monkeypatch):
    monkeypatch.setenv("STT_VAD_FILTER", "false")
    monkeypatch.setenv("STT_HOTWORDS", "Amadeus, Kurisu")
    config = SttConfig.from_environment()
    assert config.vad_filter is False
    assert config.hotwords == "Amadeus, Kurisu"
    monkeypatch.setenv("STT_VAD_FILTER", "maybe")
    with pytest.raises(ValueError, match="STT_VAD_FILTER"):
        SttConfig.from_environment()
    monkeypatch.setenv("STT_VAD_FILTER", "true")
    monkeypatch.setenv("STT_HOTWORDS", "a" * 257)
    with pytest.raises(ValueError, match="STT_HOTWORDS"):
        SttConfig.from_environment()
