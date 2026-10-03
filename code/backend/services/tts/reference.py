import hashlib
import os
from pathlib import Path

from speech_runtime.contracts import Voice


def resolve_reference(voice: Voice) -> Path:
    root = Path(
        os.environ.get(
            "VOICE_REFERENCE_DIRECTORY", "../assets/voice-profiles/references"
        )
    ).resolve(strict=True)
    file = (root / voice.referenceFile).resolve(strict=True)
    if (
        file.parent != root
        or not file.is_file()
        or file.stat().st_size > 10 * 1024 * 1024
    ):
        raise ValueError("Reference outside permitted directory")
    if hashlib.sha256(file.read_bytes()).hexdigest() != voice.referenceSha256:
        raise ValueError("Reference changed after activation")
    return file
