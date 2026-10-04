import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import resample_poly


def load_pcm(path):
    with wave.open(str(Path(path)), "rb") as file:
        rate, channels = file.getframerate(), file.getnchannels()
        if (
            file.getsampwidth() != 2
            or channels not in (1, 2)
            or file.getcomptype() != "NONE"
        ):
            raise ValueError("Expected PCM16 mono or stereo WAV")
        samples = (
            np.frombuffer(file.readframes(file.getnframes()), dtype="<i2").astype(
                np.float32
            )
            / 32768.0
        )
    if channels == 2:
        samples = samples.reshape(-1, 2).mean(axis=1)
    duration = len(samples) / rate
    if not 0.1 <= duration <= 30:
        raise ValueError("Audio duration must be between 0.1 and 30 seconds")
    diagnostics = {
        "audioSeconds": duration,
        "sourceSampleRate": rate,
        "rms": float(np.sqrt(np.mean(samples**2))),
        "peak": float(np.max(np.abs(samples))),
        "clippedFraction": float(np.mean(np.abs(samples) >= 0.999)),
    }
    if rate != 16000:
        factor = math.gcd(rate, 16000)
        samples = resample_poly(samples, 16000 // factor, rate // factor).astype(
            np.float32
        )
    return samples, diagnostics
