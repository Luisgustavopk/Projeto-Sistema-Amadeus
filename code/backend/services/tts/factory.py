"""Select an engine without importing both model dependency stacks."""

import os


def load_engine():
    engine = os.environ.get("TTS_ENGINE", "chatterbox")

    if engine == "qwen-base":
        from .qwen.engine import QwenEngine

        return QwenEngine()

    if engine == "chatterbox":
        from .engine import ChatterboxEngine

        return ChatterboxEngine()

    raise ValueError("TTS_ENGINE must be qwen-base or chatterbox")
