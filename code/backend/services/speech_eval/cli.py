import argparse
import gc
import json
import statistics
import time
from datetime import UTC, datetime
from pathlib import Path

from speech_eval.audio import load_pcm
from speech_eval.scoring import word_error_rate


def main():
    parser = argparse.ArgumentParser(
        description="Compare STT models on identical local recordings."
    )
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--models", default="small,medium")
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--beam-size", type=int, choices=range(1, 6), default=3)
    parser.add_argument("--runs", type=int, choices=range(1, 6), default=3)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8-sig"))
    cases = manifest.get("cases", [])
    if not 1 <= len(cases) <= 100:
        parser.error("Manifest requires 1 to 100 recordings")
    models = [item.strip() for item in args.models.split(",") if item.strip()]
    if not 1 <= len(models) <= 4:
        parser.error("Select 1 to 4 models")
    prepared = []
    for case in cases:
        if not isinstance(case.get("expected"), str) or not case["expected"].strip():
            parser.error("Every recording requires its correct expected transcript")
        audio, diagnostics = load_pcm(args.manifest.parent / case["file"])
        prepared.append((case, audio, diagnostics))
    # Models are loaded sequentially so comparison does not multiply GPU usage.
    from faster_whisper import WhisperModel

    report = {
        "createdAt": datetime.now(UTC).isoformat(),
        "device": args.device,
        "computeType": args.compute_type,
        "beamSize": args.beam_size,
        "runs": args.runs,
        "corpusKind": manifest.get("corpusKind", "unclassified"),
        "referenceVerified": manifest.get("referenceVerified", False),
        "productionChanged": False,
        "results": [],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for name in models:
        started = time.perf_counter()
        model = WhisperModel(
            name,
            device=args.device,
            compute_type=args.compute_type,
            cpu_threads=4,
            num_workers=1,
        )
        load_seconds = time.perf_counter() - started
        # One warmup is reported separately, not mixed into steady-state latency.
        started = time.perf_counter()
        warmup, _ = model.transcribe(
            prepared[0][1],
            language="pt",
            beam_size=args.beam_size,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
        )
        list(warmup)
        warmup_seconds = time.perf_counter() - started
        for case, audio, diagnostics in prepared:
            attempts = []
            for _ in range(args.runs):
                started = time.perf_counter()
                segments, _ = model.transcribe(
                    audio,
                    language="pt",
                    beam_size=args.beam_size,
                    temperature=0.0,
                    condition_on_previous_text=False,
                    vad_filter=True,
                )
                text = " ".join(segment.text.strip() for segment in segments).strip()
                elapsed = time.perf_counter() - started
                attempts.append(
                    {
                        "transcript": text,
                        "seconds": elapsed,
                        **word_error_rate(case["expected"], text),
                    }
                )
            result = {
                "id": case["id"],
                "model": name,
                "loadSeconds": load_seconds,
                "warmupSeconds": warmup_seconds,
                "audio": diagnostics,
                "attempts": attempts,
                "medianSeconds": statistics.median(
                    item["seconds"] for item in attempts
                ),
                "meanWer": statistics.mean(item["wer"] for item in attempts),
            }
            report["results"].append(result)
            args.output.write_text(
                json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(
                json.dumps(
                    {
                        "id": case["id"],
                        "model": name,
                        "medianSeconds": result["medianSeconds"],
                        "meanWer": result["meanWer"],
                    }
                ),
                flush=True,
            )
        del model
        gc.collect()
    print(f"Report: {args.output}", flush=True)


if __name__ == "__main__":
    main()
