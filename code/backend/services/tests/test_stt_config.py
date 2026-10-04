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
