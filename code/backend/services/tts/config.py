"""Validated, local synthesis controls; no emotion guarantees."""

import math
import os
from dataclasses import dataclass


def bounded_float(name: str, default: float, lower: float, upper: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except ValueError:
        raise ValueError(f"{name} must be a number") from None

    if not math.isfinite(value) or not lower <= value <= upper:
        raise ValueError(f"{name} must be between {lower} and {upper}")

    return value


@dataclass(frozen=True)
class SynthesisConfig:
    exaggeration: float
    cfg_weight: float
    temperature: float

    @classmethod
    def from_environment(cls):
        # Conservative audition profile: less exaggerated, less random.
        # Subjective naturalness and voice fidelity still require listening.
        return cls(
            exaggeration=bounded_float("TTS_EXAGGERATION", 0.3, 0.0, 1.0),
            cfg_weight=bounded_float("TTS_CFG_WEIGHT", 0.5, 0.0, 1.0),
            temperature=bounded_float("TTS_TEMPERATURE", 0.65, 0.05, 2.0),
        )
