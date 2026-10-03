import base64
import os

import numpy as np

from speech_runtime.contracts import Execute
from speech_runtime.errors import NoSpeechDetected


class WhisperEngine:
    def __init__(self):
        from faster_whisper import WhisperModel

        self.model = WhisperModel(
            os.environ.get("STT_MODEL", "small"),
            device=os.environ.get("STT_DEVICE", "cpu"),
            compute_type=os.environ.get("STT_COMPUTE_TYPE", "int8"),
        )

    def execute(self, data: Execute):
        if data.audio is None or data.voice is not None or data.content:
            raise ValueError("Audio required")
        raw = base64.b64decode(data.audio.pcmBase64, validate=True)
        if len(raw) < 3200 or len(raw) > 960000 or len(raw) % 2:
            raise ValueError("Invalid PCM duration")
        samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
        segments, _ = self.model.transcribe(
            samples, language="pt", vad_filter=True, beam_size=1
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        if not text:
            raise NoSpeechDetected("No speech detected")
        if len(text) > 4000:
            raise ValueError("No bounded transcript")
        return {"content": text, "inputTokens": None, "outputTokens": None}
