"""Read a transcript bound to the already validated reference audio."""

import json
from pathlib import Path


def read_transcript(reference: Path, expected_sha256: str) -> str:
    sidecar = reference.with_suffix(".json").resolve()

    if (
        sidecar.parent != reference.parent
        or not sidecar.is_file()
        or sidecar.stat().st_size > 16 * 1024
    ):
        raise ValueError("Reference transcript sidecar required")

    try:
        metadata = json.loads(sidecar.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        raise ValueError("Invalid reference transcript metadata") from None

    if not isinstance(metadata, dict):
        raise ValueError("Invalid reference transcript metadata")  # noqa: TRY004

    text = metadata.get("transcript")

    if metadata.get("referenceSha256") != expected_sha256:
        raise ValueError("Transcript belongs to a different reference")

    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ValueError("A bounded reference transcript is required")

    return text.strip()
