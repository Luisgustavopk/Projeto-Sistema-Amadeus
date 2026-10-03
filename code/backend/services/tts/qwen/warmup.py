"""Prepare one explicitly configured local voice before accepting requests."""

import hashlib
import logging
import os
from pathlib import Path
from time import perf_counter

from speech_runtime.contracts import Execute


def warmup(engine, filename: str) -> float:
    started = perf_counter()
    root = Path(
        os.environ.get(
            "VOICE_REFERENCE_DIRECTORY", "../assets/voice-profiles/references"
        )
    ).resolve(strict=True)
    reference = (root / filename).resolve(strict=True)

    if reference.parent != root or reference.stat().st_size > 10 * 1024 * 1024:
        raise ValueError("Warmup reference outside permitted directory or too large")

    engine.execute(
        Execute(
            protocolVersion="1.0",
            role="tts",
            content="Olá, este é um teste da voz do Amadeus.",
            dataClass="local-only",
            maxTokens=1,
            voice={
                "id": "00000000-0000-0000-0000-000000000000",
                "referenceFile": filename,
                "referenceSha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
            },
        )
    )
    elapsed = perf_counter() - started
    logging.getLogger("uvicorn.error").info(
        "Qwen voice warmed in %.2f seconds", elapsed
    )
    return elapsed
