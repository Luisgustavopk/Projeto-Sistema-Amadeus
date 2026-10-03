"""Qwen Base adapter: reference conditioning, synthesis and PCM transport."""

import base64
from time import perf_counter

from speech_runtime.contracts import Execute

from ..audio import encode_pcm
from ..reference import resolve_reference
from .config import QwenConfig
from .loader import load_model
from .reference_context import read_transcript
from .synthesis import synthesize
from .warmup import warmup


class QwenEngine:
    def __init__(self):
        self.config = QwenConfig.from_environment()
        self.model = load_model(self.config)
        self._prompt_key = None
        self._prompt = None
        self._timings = {}
        self._warmup_seconds = (
            warmup(self, self.config.warmup_reference)
            if self.config.warmup_reference
            else 0
        )
        self._timings = {}

    def execute(self, data: Execute):
        if (
            data.voice is None
            or data.audio is not None
            or not data.content.strip()
            or len(data.content) > 220
        ):
            raise ValueError("Custom voice and bounded text required")

        started = perf_counter()
        reference = resolve_reference(data.voice)
        transcript = read_transcript(reference, data.voice.referenceSha256)
        key = (str(reference), data.voice.referenceSha256, transcript)
        prompt_started = perf_counter()
        reused = key == self._prompt_key

        # The HTTP runtime serializes inference. Keep only the current reference.
        if not reused:
            prompt = self.model.create_voice_clone_prompt(
                ref_audio=str(reference),
                ref_text=transcript,
                x_vector_only_mode=False,
            )
            self._prompt, self._prompt_key = prompt, key

        prompt_seconds = perf_counter() - prompt_started
        generation_started = perf_counter()
        waves, sample_rate = synthesize(
            self.model, data.content, self._prompt, self.config
        )
        generation_seconds = perf_counter() - generation_started

        if len(waves) != 1:
            raise RuntimeError("Expected one synthesized segment")

        raw = encode_pcm(waves[0], int(sample_rate))
        self._timings = {
            "referenceContextReused": reused,
            "referenceContextSeconds": prompt_seconds,
            "generationSeconds": generation_seconds,
            "executionSeconds": perf_counter() - started,
            "audioSeconds": len(raw) / 32000,
        }

        return {
            "content": "",
            "inputTokens": None,
            "outputTokens": None,
            "audio": {
                "pcmBase64": base64.b64encode(raw).decode("ascii"),
                "sampleRate": 16000,
                "channels": 1,
            },
        }

    def metrics(self):
        import torch

        return {
            "engine": "qwen-base",
            "cudaGraphs": self.config.cuda_graphs,
            "synthesisSeed": self.config.seed,
            "warmupSeconds": self._warmup_seconds,
            "allocatedVramBytes": torch.cuda.memory_allocated()
            if self.config.device.startswith("cuda")
            else 0,
            **self._timings,
        }
