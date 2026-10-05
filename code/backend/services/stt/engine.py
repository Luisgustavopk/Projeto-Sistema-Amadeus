import base64
import os
from time import perf_counter

import numpy as np

from speech_runtime.contracts import Execute
from speech_runtime.errors import NoSpeechDetected
from stt.config import SttConfig


class WhisperEngine:
    def __init__(self):
        self.config = SttConfig.from_environment()
        from faster_whisper import WhisperModel

        self.device = os.environ.get("STT_DEVICE", "cpu")
        library_directory = os.environ.get("STT_CUDA_LIBRARY_DIRECTORY", "")
        if self.device == "cuda" and library_directory:
            if not os.path.isdir(library_directory):
                raise ValueError("Invalid CUDA library directory")
            os.environ["PATH"] = library_directory + os.pathsep + os.environ["PATH"]
            if os.name == "nt":
                self._cuda_library_handle = os.add_dll_directory(library_directory)

        self.model = WhisperModel(
            os.environ.get("STT_MODEL", "small"),
            device=self.device,
            compute_type=os.environ.get("STT_COMPUTE_TYPE", "int8"),
        )
        # Pay CUDA initialization during startup, before the first real utterance.
        if self.device == "cuda":
            started = perf_counter()
            segments, _ = self.model.transcribe(
                np.zeros(16000, dtype=np.float32),
                language="pt",
                beam_size=1,
                vad_filter=False,
                max_new_tokens=8,
            )
            list(segments)
            self._warmup_seconds = perf_counter() - started

    def execute(self, data: Execute):
        if data.audio is None or data.voice is not None or data.content:
            raise ValueError("Audio required")
        raw = base64.b64decode(data.audio.pcmBase64, validate=True)
        if len(raw) < 3200 or len(raw) > 960000 or len(raw) % 2:
            raise ValueError("Invalid PCM duration")
        samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
        started = perf_counter()
        audio_seconds = len(samples) / 16000
        try:
            segments, _ = self.model.transcribe(
                samples,
                language="pt",
                vad_filter=self.config.vad_filter,
                hotwords=self.config.hotwords or None,
                beam_size=self.config.beam_size,
                temperature=0.0,
                condition_on_previous_text=False,
            )
            text = " ".join(segment.text.strip() for segment in segments).strip()
        finally:
            elapsed = perf_counter() - started
            self._timings = {
                "transcriptionSeconds": elapsed,
                "audioSeconds": audio_seconds,
                "realTimeFactor": elapsed / audio_seconds,
            }
        if not text:
            raise NoSpeechDetected("No speech detected")
        if len(text) > 4000:
            raise ValueError("No bounded transcript")
        return {"content": text, "inputTokens": None, "outputTokens": None}

    def metrics(self):
        return {
            "engine": "faster-whisper",
            "beamSize": self.config.beam_size,
            "vadFilter": self.config.vad_filter,
            "hotwordsConfigured": bool(self.config.hotwords),
            "model": os.environ.get("STT_MODEL", "small"),
            "device": os.environ.get("STT_DEVICE", "cpu"),
            "computeType": os.environ.get("STT_COMPUTE_TYPE", "int8"),
            "warmupSeconds": getattr(self, "_warmup_seconds", None),
            **getattr(self, "_timings", {}),
        }
