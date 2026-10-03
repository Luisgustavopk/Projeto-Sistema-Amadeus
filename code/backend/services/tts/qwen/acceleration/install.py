"""Limit private-model adaptations to the runtime versions validated locally."""

from importlib.metadata import version


def install_acceleration(model):
    expected = {"qwen-tts": "0.1.1", "transformers": "4.57.3", "torch": "2.6.0"}

    for package, release in expected.items():
        if version(package).split("+")[0] != release:
            raise RuntimeError(
                f"CUDA graphs require {package}=={release}; "
                "set QWEN_CUDA_GRAPHS=false to use the standard runtime"
            )

    from .predictor import PredictorGraph
    from .talker import TalkerGraph
    from .token_mask import accelerate_token_mask

    talker = model.model.talker

    if talker.config.num_code_groups != 16 or talker.config.sliding_window is not None:
        raise RuntimeError("Unsupported model architecture for Qwen CUDA graphs")

    predictor = PredictorGraph(talker.code_predictor, talker.config.hidden_size)
    decoder = TalkerGraph(talker.model)
    talker.code_predictor.generate = predictor.generate
    talker.model.forward = decoder.forward
    accelerate_token_mask(talker)
    return predictor, decoder
