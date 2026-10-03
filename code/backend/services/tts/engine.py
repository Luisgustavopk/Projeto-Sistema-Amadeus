import base64
import os

from speech_runtime.contracts import Execute

from .audio import encode_pcm
from .config import SynthesisConfig
from .reference import resolve_reference


class ChatterboxEngine:
    def __init__(self):
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        self.synthesis = SynthesisConfig.from_environment()
        self.model = ChatterboxMultilingualTTS.from_pretrained(
            device=os.environ.get("TTS_DEVICE", "cpu")
        )

    def execute(self, data: Execute):
        if (
            data.voice is None
            or data.audio is not None
            or not data.content.strip()
            or len(data.content) > 220
        ):
            raise ValueError("Custom voice and bounded text required")
        reference = resolve_reference(data.voice)
        wav = self.model.generate(
            data.content,
            language_id="pt",
            audio_prompt_path=str(reference),
            exaggeration=self.synthesis.exaggeration,
            cfg_weight=self.synthesis.cfg_weight,
            temperature=self.synthesis.temperature,
        )
        samples = wav.detach().cpu().numpy().reshape(-1)
        raw = encode_pcm(samples, int(self.model.sr))
        return {
            "content": "",
            "inputTokens": None,
            "outputTokens": None,
            "audio": {
                "pcmBase64": base64.b64encode(raw).decode("ascii"),
                "sampleRate": 16000,
                "channels": 1,
            },
        }

    def metrics(self):
        import torch

        return {
            "allocatedVramBytes": torch.cuda.memory_allocated()
            if torch.cuda.is_available()
            else 0
        }
