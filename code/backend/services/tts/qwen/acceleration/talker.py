"""Capture single-token decoding; reset the KV cache at every new segment."""

import torch
from torch.nn.attention import SDPBackend, sdpa_kernel
from transformers import StaticCache
from transformers.modeling_outputs import BaseModelOutputWithPast

from .capture import capture


class TalkerGraph:
    def __init__(self, model, capacity=1024, max_new_tokens=512):
        self.original = model.forward
        self.capacity = capacity
        self.max_new_tokens = max_new_tokens
        self.active = False
        self.cache = StaticCache(config=model.config, max_cache_len=capacity)
        weight = next(model.parameters())
        self.inputs = torch.zeros(
            (1, 1, model.config.hidden_size), dtype=weight.dtype, device=weight.device
        )
        self.positions = torch.zeros((3, 1, 1), dtype=torch.long, device=weight.device)
        self.offset = torch.zeros((1,), dtype=torch.long, device=weight.device)
        self.keys = torch.arange(capacity, device=weight.device)
        self.graph, self.output = capture(self.run)

    def run(self):
        mask = (self.keys <= self.offset).view(1, 1, 1, -1)
        # Math SDPA keeps attention intermediates in float32 with BF16 weights.
        # Padding the fixed cache then has negligible effect on attention results.
        with sdpa_kernel(SDPBackend.MATH):
            return self.original(
                inputs_embeds=self.inputs,
                position_ids=self.positions,
                cache_position=self.offset,
                attention_mask=mask,
                past_key_values=self.cache,
                use_cache=True,
                output_hidden_states=True,
                return_dict=True,
            )

    @torch.inference_mode()
    def forward(self, **kwargs):
        embeds = kwargs["inputs_embeds"]

        if embeds.shape[1] != 1:
            self.active = False
            result = self.original(**kwargs)
            mask = kwargs.get("attention_mask")
            supported = (
                embeds.shape[0] == 1
                and embeds.shape[1] + self.max_new_tokens < self.capacity
                and not kwargs.get("output_attentions")
                and kwargs.get("use_cache") is not False
                and result.past_key_values is not None
                and (mask is None or (mask.ndim == 2 and bool(mask.all())))
            )

            if supported:
                self.cache.reset()

                for target, source in zip(
                    self.cache.layers, result.past_key_values.layers, strict=True
                ):
                    length = source.keys.shape[2]
                    target.keys[:, :, :length].copy_(source.keys)
                    target.values[:, :, :length].copy_(source.values)

                result.past_key_values = self.cache
                self.active = True

            return result

        if not self.active or kwargs.get("past_key_values") is not self.cache:
            return self.original(**kwargs)

        self.inputs.copy_(embeds)
        self.positions.copy_(kwargs["position_ids"])
        self.offset.copy_(kwargs["cache_position"])
        self.graph.replay()
        # Generation retains these outputs. A later replay must not overwrite them.
        return BaseModelOutputWithPast(
            last_hidden_state=self.output.last_hidden_state.clone(),
            past_key_values=self.cache,
            hidden_states=tuple(value.clone() for value in self.output.hidden_states),
        )
