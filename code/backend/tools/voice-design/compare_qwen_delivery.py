"""Isolated full-phrase/segmentation and 24/16 kHz listening comparison."""

import argparse
import base64
import hashlib
import json
import os
import socket
import sys
import wave
from pathlib import Path
from time import perf_counter


def save_wav(path, pcm, rate):
    with wave.open(str(path), "wb") as file:
        file.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        file.writeframes(pcm)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--reference", default="amadeus.wav")
    args = parser.parse_args()
    if not args.run:
        print(
            "Four syntheses with the same reference and seed; saves full/segmented WAVs at 24/16 kHz. Stop the TTS before --run. No production changes."
        )
        return
    # Do not load a second model alongside a running TTS service.
    with socket.socket() as connection:
        connection.settimeout(0.3)
        if connection.connect_ex(("127.0.0.1", 8002)) == 0:
            raise RuntimeError(
                "Stop the TTS on port 8002 before the isolated comparison"
            )

    backend = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(backend / "services"))
    from dotenv import load_dotenv

    load_dotenv(backend / "services/tts/.env", override=False)
    os.environ["VOICE_REFERENCE_DIRECTORY"] = str(
        backend / "assets/voice-profiles/references"
    )
    os.environ["HF_HUB_OFFLINE"] = "1"
    import torch

    device = os.environ.get("TTS_DEVICE", "cuda:0")
    if device.startswith("cuda") and (
        not torch.cuda.is_available() or torch.cuda.mem_get_info()[0] < 6 * 1024**3
    ):
        raise RuntimeError(
            "Insufficient free CUDA memory for an isolated Qwen comparison"
        )

    from speech_runtime.contracts import Execute, Voice
    from tts.audio import encode_pcm
    from tts.qwen import engine as module

    voice = Voice(
        id="00000000-0000-0000-0000-000000000000",
        referenceFile=args.reference,
        referenceSha256="0" * 64,
    )
    reference = backend / "assets/voice-profiles/references" / voice.referenceFile
    voice.referenceSha256 = hashlib.sha256(reference.read_bytes()).hexdigest()
    # Normal engine validation also checks the sidecar transcript and hash.
    engine = module.QwenEngine()
    captured = {}

    def capture(samples, rate):
        captured["native"] = encode_pcm(samples, rate, output_rate=24000)
        captured["sourceRate"] = rate
        return encode_pcm(samples, rate)

    module.encode_pcm = capture
    sentences = [
        "Hoje eu tive uma ideia diferente.",
        "Se a hipótese estiver certa, a primeira medição deve mostrar alguma coisa.",
        "Tá, você tinha razão dessa vez.",
    ]
    directory = (
        backend
        / "api/data/voice-tests/delivery-comparison"
        / str(int(perf_counter() * 1000))
    )
    directory.mkdir(parents=True)
    report = {
        "referenceSha256": voice.referenceSha256,
        "seed": engine.config.seed,
        "device": engine.config.device,
        "cudaGraphs": engine.config.cuda_graphs,
        "productionChanged": False,
        "humanReview": "pending",
        "cases": [],
    }
    segmented_native, segmented_transport = [], []
    for index, text in enumerate([" ".join(sentences), *sentences]):
        started = perf_counter()
        result = engine.execute(
            Execute(
                protocolVersion="1.0",
                role="tts",
                content=text,
                dataClass="synthetic",
                maxTokens=1,
                voice=voice,
            )
        )
        transport = base64.b64decode(result["audio"]["pcmBase64"], validate=True)
        native = captured["native"]
        label = "full" if index == 0 else f"segment-{index}"
        save_wav(directory / f"{label}-24k.wav", native, 24000)
        save_wav(directory / f"{label}-16k.wav", transport, 16000)
        report["cases"].append(
            {
                "id": label,
                "text": text,
                "seconds": perf_counter() - started,
                "sourceSampleRate": captured["sourceRate"],
                "metrics": engine.metrics(),
            }
        )
        if index:
            segmented_native.append(native)
            segmented_transport.append(transport)
        print(f"{label}: saved local comparison", flush=True)
        (directory / "result.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    save_wav(directory / "segmented-24k.wav", b"".join(segmented_native), 24000)
    save_wav(directory / "segmented-16k.wav", b"".join(segmented_transport), 16000)
    print(f"Results: {directory}", flush=True)


if __name__ == "__main__":
    main()
