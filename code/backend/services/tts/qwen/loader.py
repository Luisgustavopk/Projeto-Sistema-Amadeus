"""Load local weights and install the optional, version-checked accelerator."""

from .config import QwenConfig


def load_model(config: QwenConfig):
    import torch
    from qwen_tts import Qwen3TTSModel

    if config.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested for Qwen but unavailable")

    model = Qwen3TTSModel.from_pretrained(
        str(config.model_directory),
        device_map=config.device,
        dtype=torch.bfloat16 if config.device != "cpu" else torch.float32,
        attn_implementation="sdpa",
        low_cpu_mem_usage=True,
        local_files_only=True,
    )

    if config.cuda_graphs:
        from .acceleration.install import install_acceleration

        install_acceleration(model)

    return model
