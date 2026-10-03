"""Capture the 15 fixed codebook steps normally dispatched individually."""

from types import SimpleNamespace

import torch

from .capture import capture


class PredictorGraph:
    def __init__(self, predictor, hidden_size):
        self.predictor = predictor
        self.original = predictor.generate
        weight = next(predictor.parameters())
        self.inputs = torch.zeros(
            (1, 2, hidden_size), device=weight.device, dtype=weight.dtype
        )
        self.positions = [torch.arange(2, device=weight.device)] + [
            torch.tensor([step + 1], device=weight.device) for step in range(1, 15)
        ]
        self.graph, self.output = capture(self.run)

    def run(self):
        cache = None
        tokens = []

        for step in range(15):
            embeds = (
                self.inputs
                if step == 0
                else self.predictor.get_input_embeddings()[step - 1](tokens[-1])
            )
            positions = self.positions[step]
            result = self.predictor.model(
                inputs_embeds=self.predictor.small_to_mtp_projection(embeds),
                # SDPA applies causal attention to the two-token prefill and
                # unrestricted attention to each one-token cached decode.
                attention_mask={"full_attention": None},
                position_ids=positions.unsqueeze(0),
                cache_position=positions,
                past_key_values=cache,
                use_cache=True,
                output_hidden_states=False,
                return_dict=True,
            )
            cache = result.past_key_values
            logits = self.predictor.lm_head[step](result.last_hidden_state)[
                :, -1, :
            ].float()
            # Match the pinned model's temperature/top-k/multinomial sampling.
            logits = logits / 0.9
            threshold = torch.topk(logits, 50)[0][..., -1, None]
            logits = logits.masked_fill(logits < threshold, -float("inf"))
            tokens.append(torch.multinomial(torch.softmax(logits, dim=-1), 1))

        return torch.cat(tokens, dim=1)

    @torch.inference_mode()
    def generate(self, **kwargs):
        embeds = kwargs.get("inputs_embeds")
        expected = {
            "max_new_tokens": 15,
            "do_sample": True,
            "top_k": 50,
            "top_p": 1.0,
            "temperature": 0.9,
            "output_hidden_states": True,
            "return_dict_in_generate": True,
        }

        if (
            set(kwargs) != {*expected, "inputs_embeds"}
            or any(kwargs.get(key) != value for key, value in expected.items())
            or embeds.shape != self.inputs.shape
            or embeds.device != self.inputs.device
            or embeds.dtype != self.inputs.dtype
        ):
            return self.original(**kwargs)

        self.inputs.copy_(embeds)
        self.graph.replay()
        return SimpleNamespace(sequences=self.output.clone())
