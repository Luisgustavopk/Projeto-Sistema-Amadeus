"""Create controlled local TTS auditions in native and protocol sample rates."""

import argparse
import hashlib
import json
import random
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from scipy.signal import resample_poly

PROFILES = [
    ("01-padrao", 0.5, 0.5, 0.8),
    ("02-contida", 0.3, 0.5, 0.65),
    ("03-cadencia", 0.4, 0.3, 0.65),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--text", default="Olá, este é um teste da voz do Amadeus.")
    args = parser.parse_args()

    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Use an empty output directory to preserve prior comparisons.")

    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    model = (
        ChatterboxMultilingualTTS.from_local(args.checkpoint, device=args.device)
        if args.checkpoint
        else ChatterboxMultilingualTTS.from_pretrained(device=args.device)
    )
    args.output.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(args.reference.read_bytes()).hexdigest()
    results = []

    for name, exaggeration, cfg_weight, temperature in PROFILES:
        random.seed(args.seed)
        np.random.seed(args.seed)
        torch.manual_seed(args.seed)
        if args.device == "cuda":
            torch.cuda.manual_seed_all(args.seed)

        started = time.perf_counter()
        wav = model.generate(
            args.text,
            language_id="pt",
            audio_prompt_path=str(args.reference),
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
            temperature=temperature,
        )
        elapsed = time.perf_counter() - started
        samples = wav.detach().cpu().numpy().reshape(-1)
        if not len(samples) or not np.isfinite(samples).all():
            raise ValueError("Invalid model output")

        peak = float(np.max(np.abs(samples)))
        gain = min(1.0, 0.98 / peak) if peak else 1.0
        native = args.output / f"{name}-24k.wav"
        if model.sr != 24000:
            raise ValueError("Unexpected model sample rate")
        sf.write(native, samples * gain, model.sr, subtype="PCM_16")

        reduced = resample_poly(samples * gain, 2, 3)
        reduced_peak = float(np.max(np.abs(reduced)))
        reduced_gain = min(1.0, 0.98 / reduced_peak) if reduced_peak else 1.0
        sf.write(
            args.output / f"{name}-16k.wav",
            reduced * reduced_gain,
            16000,
            subtype="PCM_16",
        )
        results.append(
            {
                "name": name,
                "parameters": {
                    "exaggeration": exaggeration,
                    "cfg_weight": cfg_weight,
                    "temperature": temperature,
                },
                "seed": args.seed,
                "device": args.device,
                "referenceSha256": digest,
                "text": args.text,
                "seconds": len(samples) / model.sr,
                "generationSeconds": elapsed,
                "rawPeak": peak,
                "gain": gain,
                "humanApproval": False,
            }
        )
        (args.output / "comparison.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"{name}: {elapsed:.2f}s; listening required", flush=True)


if __name__ == "__main__":
    main()
