"""Convert model output to the existing mono 16 kHz PCM transport."""

from math import gcd

import numpy as np
from scipy.signal import resample_poly


def encode_pcm(samples: np.ndarray, sample_rate: int) -> bytes:
    if sample_rate <= 0 or samples.ndim != 1:
        raise ValueError("Invalid synthesis waveform")

    if (
        not len(samples)
        or not np.isfinite(samples).all()
        or len(samples) > sample_rate * 90
    ):
        raise ValueError("Synthesis output invalid")

    divisor = gcd(sample_rate, 16000)
    converted = resample_poly(samples, 16000 // divisor, sample_rate // divisor)

    if not np.isfinite(converted).all() or len(converted) > 16000 * 90:
        raise ValueError("Converted synthesis output invalid")

    # Resampling can produce peaks above full scale. Reduce the whole waveform
    # proportionally instead of flattening peaks through hard clipping.
    peak = float(np.max(np.abs(converted)))
    if peak >= 1.0:
        converted = converted * (0.98 / peak)

    return (converted * 32767).astype("<i2").tobytes()
