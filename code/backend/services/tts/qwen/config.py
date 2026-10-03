"""Local model settings, independent of Chatterbox synthesis controls."""

import os
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class QwenConfig:
    model_directory: Path
    device: str
    cuda_graphs: bool = False
    warmup_reference: str | None = None
    seed: int = 42

    @classmethod
    def from_environment(cls):
        backend = Path(__file__).resolve().parents[3]
        configured = os.environ.get("QWEN_MODEL_DIRECTORY")
        directory = (
            Path(configured)
            if configured
            else backend / "api/data/models/qwen3-tts-base-1.7b"
        ).resolve(strict=True)

        if not directory.is_dir() or not (directory / "config.json").is_file():
            raise ValueError("QWEN_MODEL_DIRECTORY must contain a local Qwen model")

        device = os.environ.get("TTS_DEVICE", "cuda:0")

        if device not in {"cpu", "cuda", "cuda:0"}:
            raise ValueError("TTS_DEVICE must be cpu, cuda or cuda:0")

        graphs = os.environ.get(
            "QWEN_CUDA_GRAPHS", "false" if device == "cpu" else "true"
        ).lower()

        if graphs not in {"true", "false"}:
            raise ValueError("QWEN_CUDA_GRAPHS must be true or false")

        if graphs == "true" and device == "cpu":
            raise ValueError("QWEN_CUDA_GRAPHS requires CUDA")

        reference = os.environ.get("QWEN_WARMUP_REFERENCE") or None

        if reference and (
            len(reference) > 128 or not re.fullmatch(r"[a-zA-Z0-9_.-]+\.wav", reference)
        ):
            raise ValueError("QWEN_WARMUP_REFERENCE must be a WAV filename")

        seed = int(os.environ.get("QWEN_SYNTHESIS_SEED", "42"))
        if not 0 <= seed <= 4294967295:
            raise ValueError("QWEN_SYNTHESIS_SEED must be an unsigned 32-bit integer")
        return cls(directory, device, graphs == "true", reference, seed)
