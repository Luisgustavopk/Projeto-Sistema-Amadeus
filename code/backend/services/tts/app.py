from speech_runtime.server import create_service

from .factory import load_engine

app = create_service("tts", load_engine, custom_voice=True)
