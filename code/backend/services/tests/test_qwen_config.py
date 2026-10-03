import pytest

from tts.qwen.config import QwenConfig


@pytest.fixture
def model_directory(monkeypatch, tmp_path):
    (tmp_path / "config.json").write_text("{}")
    monkeypatch.setenv("QWEN_MODEL_DIRECTORY", str(tmp_path))
    monkeypatch.delenv("QWEN_CUDA_GRAPHS", raising=False)
    monkeypatch.delenv("QWEN_WARMUP_REFERENCE", raising=False)


def test_cpu_does_not_enable_cuda_graphs(monkeypatch, model_directory):
    monkeypatch.setenv("TTS_DEVICE", "cpu")
    assert QwenConfig.from_environment().cuda_graphs is False
    monkeypatch.setenv("QWEN_CUDA_GRAPHS", "true")

    with pytest.raises(ValueError, match="requires CUDA"):
        QwenConfig.from_environment()


@pytest.mark.parametrize("value", ["../private.wav", "a/b.wav", "sample.mp3"])
def test_warmup_cannot_select_paths_outside_references(
    monkeypatch, model_directory, value
):
    monkeypatch.setenv("TTS_DEVICE", "cuda:0")
    monkeypatch.setenv("QWEN_WARMUP_REFERENCE", value)

    with pytest.raises(ValueError, match="WAV filename"):
        QwenConfig.from_environment()


def test_invalid_acceleration_flag_fails_before_model_load(
    monkeypatch, model_directory
):
    monkeypatch.setenv("QWEN_CUDA_GRAPHS", "perhaps")

    with pytest.raises(ValueError, match="true or false"):
        QwenConfig.from_environment()
