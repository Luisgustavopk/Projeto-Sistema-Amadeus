"""Repeatable local TTS benchmark. Outputs and audio stay under api/data."""

import argparse
import base64
import json
import os
import statistics
import sys
import wave
from pathlib import Path
from time import perf_counter


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["standard", "accelerated"], required=True)
    parser.add_argument("--reference", default="amadeus.wav")
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()

    if not 1 <= args.repeats <= 100:
        parser.error("repeats must be between 1 and 100")

    backend = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(backend / "services"))
    os.environ["TTS_DEVICE"] = "cuda:0"
    os.environ["QWEN_CUDA_GRAPHS"] = str(args.mode == "accelerated").lower()
    os.environ["QWEN_WARMUP_REFERENCE"] = args.reference
    os.environ["VOICE_REFERENCE_DIRECTORY"] = str(
        backend / "assets/voice-profiles/references"
    )
    os.environ["HF_HUB_OFFLINE"] = "1"

    import torch

    from speech_runtime.contracts import Execute, Voice
    from tts.qwen.engine import QwenEngine

    # Validate the filename before reading its sidecar.
    voice = Voice(
        id="00000000-0000-0000-0000-000000000000",
        referenceFile=args.reference,
        referenceSha256="0" * 64,
    )
    sidecar = (
        backend
        / "assets/voice-profiles/references"
        / Path(args.reference).with_suffix(".json")
    )
    voice.referenceSha256 = json.loads(sidecar.read_text(encoding="utf-8"))[
        "referenceSha256"
    ]
    started = perf_counter()
    engine = QwenEngine()
    startup = perf_counter() - started
    print(f"Startup and warmup: {startup:.2f} s", flush=True)
    directory = backend / "api/data/voice-tests/latency-analysis"
    directory.mkdir(parents=True, exist_ok=True)
    texts = [
        "Olá, este é um teste da voz do Amadeus.",
        "Tá, você tinha razão dessa vez.",
        "Se a hipótese estiver certa, a primeira medição deve mostrar alguma coisa.",
    ]
    rows = []

    for index, text in enumerate(texts, 1):
        for repeat in range(args.repeats):
            torch.manual_seed(42 + repeat)
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
            elapsed = perf_counter() - started
            pcm = base64.b64decode(result["audio"]["pcmBase64"])
            metrics = engine.metrics()
            row = {
                "mode": args.mode,
                "case": index,
                "seed": 42 + repeat,
                "text": text,
                "elapsedSeconds": elapsed,
                "realTimeFactor": elapsed / metrics["audioSeconds"],
                **metrics,
            }
            rows.append(row)

            if repeat == 0:
                with wave.open(
                    str(directory / f"{args.mode}-{index}.wav"), "wb"
                ) as file:
                    file.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                    file.writeframes(pcm)

            (directory / f"{args.mode}-benchmark.json").write_text(
                json.dumps(
                    {"startupSeconds": startup, "samples": rows},
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(
                f"Case {index}, seed {42 + repeat}: {elapsed:.2f} s, RTF {row['realTimeFactor']:.2f}",
                flush=True,
            )

    print(f"TTS p50: {statistics.median(row['elapsedSeconds'] for row in rows):.2f} s")


if __name__ == "__main__":
    main()
