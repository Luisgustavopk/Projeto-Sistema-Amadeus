import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SttConfig:
    beam_size: int = 3

    @classmethod
    def from_environment(cls):
        try:
            beam_size = int(os.environ.get("STT_BEAM_SIZE", "3"))
        except ValueError as error:
            raise ValueError("STT_BEAM_SIZE must be an integer from 1 to 5") from error
        if not 1 <= beam_size <= 5:
            raise ValueError("STT_BEAM_SIZE must be an integer from 1 to 5")
        return cls(beam_size=beam_size)
