from speech_runtime.server import create_service

from .engine import WhisperEngine

app = create_service("stt", WhisperEngine)
