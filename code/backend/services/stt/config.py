import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SttConfig:
    beam_size: int = 3
    vad_filter: bool = True
    hotwords: str = ""

    @classmethod
    def from_environment(cls):
        try:
            beam_size = int(os.environ.get("STT_BEAM_SIZE", "3"))
        except ValueError as error:
            raise ValueError("STT_BEAM_SIZE must be an integer from 1 to 5") from error
        if not 1 <= beam_size <= 5:
            raise ValueError("STT_BEAM_SIZE must be an integer from 1 to 5")
        vad_filter = os.environ.get("STT_VAD_FILTER", "true").lower()
        if vad_filter not in {"true", "false"}:
            raise ValueError("STT_VAD_FILTER must be true or false")
        hotwords = os.environ.get("STT_HOTWORDS", "").strip()
        if len(hotwords) > 256 or any(ord(character) < 32 for character in hotwords):
            raise ValueError(
                "STT_HOTWORDS must be a single line of at most 256 characters"
            )
        return cls(
            beam_size=beam_size, vad_filter=vad_filter == "true", hotwords=hotwords
        )
