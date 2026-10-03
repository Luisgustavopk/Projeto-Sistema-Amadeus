"""Reproduce the approved sampling setup without leaking RNG state."""


def synthesize(model, text, prompt, config):
    import torch

    devices = [0] if config.device.startswith("cuda") else []
    with torch.random.fork_rng(devices=devices):
        torch.manual_seed(config.seed)
        return model.generate_voice_clone(
            text=text,
            language="Portuguese",
            voice_clone_prompt=prompt,
            non_streaming_mode=True,
            max_new_tokens=512,
        )
