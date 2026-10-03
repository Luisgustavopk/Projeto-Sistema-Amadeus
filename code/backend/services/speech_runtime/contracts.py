from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Audio(StrictModel):
    pcmBase64: str = Field(min_length=4, max_length=1280000)
    sampleRate: Literal[16000]
    channels: Literal[1]


class Voice(StrictModel):
    id: str = Field(pattern=r"^[a-fA-F0-9-]{36}$")
    referenceFile: str = Field(pattern=r"^[a-zA-Z0-9_.-]+\.wav$", max_length=128)
    referenceSha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class Execute(StrictModel):
    protocolVersion: Literal["1.0"]
    role: Literal["stt", "tts"]
    model: str | None = Field(default=None, max_length=128)
    content: str = Field(max_length=4000)
    dataClass: Literal["synthetic", "personal", "local-only"]
    maxTokens: int = Field(ge=1, le=1000000)
    audio: Audio | None = None
    voice: Voice | None = None
