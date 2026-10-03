"""Build token suppression once per request instead of once per audio frame."""

import torch
from transformers import SuppressTokensLogitsProcessor


class TokenMask:
    def __init__(self, processor, vocabulary_size):
        self.mask = torch.zeros(
            vocabulary_size, dtype=torch.bool, device=processor.suppress_tokens.device
        )
        self.mask[processor.suppress_tokens] = True

    def __call__(self, input_ids, scores):
        return scores.masked_fill(self.mask, -float("inf"))


def accelerate_token_mask(talker):
    original = talker._get_logits_processor

    def build(*args, **kwargs):
        processors = original(*args, **kwargs)

        for index, processor in enumerate(processors):
            if type(processor) is SuppressTokensLogitsProcessor:
                processors[index] = TokenMask(processor, talker.config.vocab_size)

        return processors

    talker._get_logits_processor = build
