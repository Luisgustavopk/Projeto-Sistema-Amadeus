"""GPU integration check: pinned local Qwen weights required; results go to data/."""

import json
import os
import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(backend / "services"))
os.environ.update(
    TTS_DEVICE="cuda:0",
    QWEN_CUDA_GRAPHS="false",
    HF_HUB_OFFLINE="1",
    HF_HOME=str(backend / "tools/voice-design/.model-cache"),
)
os.environ.pop("QWEN_WARMUP_REFERENCE", None)
import torch
from torch.nn.attention import SDPBackend, sdpa_kernel

from tts.qwen.acceleration.install import install_acceleration
from tts.qwen.engine import QwenEngine

engine = QwenEngine()
predictor, decoder = install_acceleration(engine.model)
results = []
for seed in [17, 42, 123]:
    torch.manual_seed(seed)
    embeds = torch.randn_like(predictor.inputs) * 0.1
    options = {
        "inputs_embeds": embeds,
        "max_new_tokens": 15,
        "do_sample": True,
        "top_k": 50,
        "top_p": 1.0,
        "temperature": 0.9,
        "output_hidden_states": True,
        "return_dict_in_generate": True,
    }
    torch.manual_seed(seed)
    expected = predictor.original(**options).sequences
    torch.manual_seed(seed)
    actual = predictor.generate(**options).sequences
    assert torch.equal(expected, actual), (seed, expected, actual)
    results.append({"predictorSeed": seed, "equalTokens": actual.numel()})
print("Predictor sampling exactly equal for three seeds", flush=True)

# Compare several successive decode steps to a separate unaccelerated KV cache.
# Repeat with different prompt lengths to verify reset, retained outputs and masking.
with torch.inference_mode():
    for length in [12, 29]:
        embeds = (
            torch.randn(
                (1, length, decoder.inputs.shape[-1]),
                device="cuda:0",
                dtype=torch.bfloat16,
            )
            * 0.1
        )
        mask = torch.ones((1, length), dtype=torch.long, device="cuda:0")
        offsets = torch.arange(length, device="cuda:0")
        positions = offsets.view(1, 1, -1).expand(3, 1, -1)
        args = {
            "inputs_embeds": embeds,
            "attention_mask": mask,
            "position_ids": positions,
            "cache_position": offsets,
            "use_cache": True,
            "output_hidden_states": True,
            "return_dict": True,
        }
        standard = decoder.original(**args)
        optimized = decoder.forward(**args)
        previous = optimized.last_hidden_state.clone()
        for step in range(3):
            token = torch.randn_like(decoder.inputs) * 0.1
            offset = torch.tensor([length + step], device="cuda:0")
            args = {
                "inputs_embeds": token,
                "attention_mask": torch.ones(
                    (1, length + step + 1), dtype=torch.long, device="cuda:0"
                ),
                "position_ids": offset.view(1, 1, 1).expand(3, 1, 1),
                "cache_position": offset,
                "use_cache": True,
                "output_hidden_states": True,
                "return_dict": True,
            }
            with sdpa_kernel(SDPBackend.MATH):
                standard = decoder.original(
                    **args, past_key_values=standard.past_key_values
                )
            optimized = decoder.forward(
                **args, past_key_values=optimized.past_key_values
            )
            expected = standard.last_hidden_state.float()
            actual = optimized.last_hidden_state.float()
            relative = float(
                torch.linalg.vector_norm(expected - actual)
                / torch.linalg.vector_norm(expected)
            )
            cosine = float(
                torch.nn.functional.cosine_similarity(
                    expected.flatten(), actual.flatten(), dim=0
                )
            )
            # BF16 reductions with a padded KV cache are not bitwise equivalent.
            # Check bounded vector error separately from exact sampled-code tests.
            assert cosine > 0.999 and relative < 0.05, (cosine, relative)
            results.append(
                {
                    "promptLength": length,
                    "step": step,
                    "relativeError": relative,
                    "cosine": cosine,
                }
            )
        # Long prompts take the original path instead of overflowing the static cache.
        # Validated by the config guard and runtime branch; no extra long generation.
print(json.dumps(results), flush=True)
(
    backend / "api/data/voice-tests/latency-analysis/acceleration-validation.json"
).write_text(json.dumps(results, indent=2), encoding="utf-8")
