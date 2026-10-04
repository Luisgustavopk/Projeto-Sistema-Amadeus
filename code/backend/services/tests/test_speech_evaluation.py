import wave

import numpy as np
import pytest

from speech_eval.audio import load_pcm
from speech_eval.scoring import word_error_rate


def test_scoring_ignores_punctuation_and_case_but_preserves_words():
    assert word_error_rate("Olá, tudo bem?", "olá tudo bem") == {
        "referenceWords": 3,
        "wordErrors": 0,
        "wer": 0,
    }
    assert (
        word_error_rate("me conta uma história legal", "Mikoto tem história de Gaboi")[
            "wordErrors"
        ]
        > 0
    )


def test_scoring_accounts_for_omissions_and_insertions():
    assert word_error_rate("uma história legal", "história legal")[
        "wer"
    ] == pytest.approx(1 / 3)
    assert word_error_rate("história", "história legal")["wer"] == 1
    assert word_error_rate("uma história", "")["wer"] == 1
    with pytest.raises(ValueError):
        word_error_rate("...", "texto")


def test_audio_preserves_duration_when_resampling(tmp_path):
    path = tmp_path / "sample.wav"
    with wave.open(str(path), "wb") as file:
        file.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        file.writeframes(np.full(24000, 1000, dtype="<i2").tobytes())
    audio, diagnostics = load_pcm(path)
    assert len(audio) == 16000
    assert diagnostics["audioSeconds"] == 1
    assert diagnostics["clippedFraction"] == 0


def test_audio_rejects_unsupported_sample_width(tmp_path):
    path = tmp_path / "sample.wav"
    with wave.open(str(path), "wb") as file:
        file.setparams((1, 1, 16000, 0, "NONE", "not compressed"))
        file.writeframes(b"\x80" * 16000)
    with pytest.raises(ValueError, match="PCM16"):
        load_pcm(path)
