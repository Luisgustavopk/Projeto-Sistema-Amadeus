import numpy as np
import pytest

from tts.audio import encode_pcm
from tts.config import SynthesisConfig


def test_overload_reduces_gain_without_flattening_peaks():
    samples = np.array([0.0, 0.5, 1.0, 2.0, -2.0], dtype=np.float32)
    pcm = np.frombuffer(encode_pcm(samples, 16000), dtype="<i2")

    assert abs(int(pcm[-1])) < 32767
    assert pcm[2] < pcm[3]
    assert abs(pcm[2] / pcm[3] - 0.5) < 0.001


@pytest.mark.parametrize(
    "samples", [np.array([]), np.array([np.nan]), np.array([np.inf])]
)
def test_invalid_audio_is_rejected(samples):
    with pytest.raises(ValueError):
        encode_pcm(samples, 24000)


def test_resampling_preserves_duration():
    samples = np.sin(2 * np.pi * 440 * np.arange(24000) / 24000).astype(np.float32)
    raw = encode_pcm(samples * 0.5, 24000)

    assert len(raw) == 32000


def test_native_quality_diagnostic_does_not_change_default_transport():
    samples = np.zeros(24000, dtype=np.float32)
    assert len(encode_pcm(samples, 24000, output_rate=24000)) == 48000
    assert len(encode_pcm(samples, 24000)) == 32000
    with pytest.raises(ValueError, match="output rate"):
        encode_pcm(samples, 24000, output_rate=48000)


@pytest.mark.parametrize("value", ["nan", "inf", "-0.1", "2", "bad"])
def test_invalid_synthesis_controls_fail_before_model_load(monkeypatch, value):
    monkeypatch.setenv("TTS_EXAGGERATION", value)

    with pytest.raises(ValueError, match="TTS_EXAGGERATION"):
        SynthesisConfig.from_environment()
