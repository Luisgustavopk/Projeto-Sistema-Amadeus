"""Create original audition samples from descriptions, outside the live TTS service."""

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROFILES = ROOT.parents[1] / "assets" / "voice-profiles"
os.environ.setdefault("HF_HOME", str(ROOT / ".model-cache"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate")
    parser.add_argument("--device", choices=["cuda:0", "cpu"], default="cuda:0")
    parser.add_argument("--spec", default="candidates.json")
    parser.add_argument("--round", default="")
    args = parser.parse_args()

    for value in [args.spec, args.round, args.candidate or ""]:
        if value and (Path(value).name != value or value in [".", ".."]):
            parser.error("Use apenas nomes locais, sem diretórios.")

    import numpy as np
    import soundfile as sf
    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel

    spec = json.loads((PROFILES / args.spec).read_text(encoding="utf-8"))
    if args.candidate and args.candidate not in {c["id"] for c in spec["candidates"]}:
        parser.error("Candidata ausente na especificação.")

    output = PROFILES / "candidates" / args.round
    output.mkdir(parents=True, exist_ok=True)

    selected = [
        c for c in spec["candidates"] if not args.candidate or c["id"] == args.candidate
    ]
    for candidate in selected:
        identifier = candidate["id"]
        if Path(identifier).name != identifier or identifier in [".", ".."]:
            parser.error("Identificador de candidata inválido.")
        if any(
            (output / f"{identifier}.{suffix}").exists() for suffix in ["wav", "json"]
        ):
            parser.error(f"Amostra já existe: {identifier}. Escolha outra rodada.")

    generation = {"max_new_tokens": 512, "temperature": 0.8, "top_p": 0.95}

    if args.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA indisponível neste ambiente; instale o PyTorch CUDA.")

    print("Obtendo o modelo de criação de voz, com revisão fixa...", flush=True)
    source = snapshot_download(
        repo_id=spec["model"],
        revision=spec["revision"],
        max_workers=2,
    )
    print("Carregando o modelo...", flush=True)
    model = Qwen3TTSModel.from_pretrained(
        source,
        device_map=args.device,
        dtype=torch.bfloat16 if args.device.startswith("cuda") else torch.float32,
        attn_implementation="sdpa",
        low_cpu_mem_usage=True,
    )

    for candidate in selected:
        target = output / f"{candidate['id']}.wav"
        manifest = output / f"{candidate['id']}.json"
        if target.exists() or manifest.exists():
            raise FileExistsError(
                f"Amostra já existe: {target.name}. Preserve-a antes de gerar outra."
            )

        seed = candidate.get("seed", spec["seed"])
        torch.manual_seed(seed)
        if args.device.startswith("cuda"):
            torch.cuda.manual_seed_all(seed)

        direction = spec["commonDirection"] + " " + candidate["direction"]
        print(f"Criando {candidate['name']}...", flush=True)
        wavs, sample_rate = model.generate_voice_design(
            text=spec["text"],
            language=candidate.get("language", spec["language"]),
            instruct=direction,
            **generation,
        )
        samples = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
        duration = len(samples) / sample_rate
        if not np.isfinite(samples).all() or not 3 <= duration <= 30:
            raise ValueError(
                f"Amostra inválida ou duração fora do intervalo: {duration:.1f} s"
            )

        peak = float(np.max(np.abs(samples)))
        gain = min(1.0, 0.98 / peak) if peak > 0 else 1.0
        samples *= gain
        sf.write(target, samples, sample_rate, subtype="PCM_16")
        metadata = {
            "status": "awaiting-listening-and-selection",
            "creationMethod": "text-description",
            "referenceAudioUsed": False,
            "candidate": candidate,
            "model": spec["model"],
            "revision": spec["revision"],
            "modelLicense": "Apache-2.0",
            "seed": seed,
            "language": candidate.get("language", spec["language"]),
            "requestedLocale": spec.get("requestedLocale"),
            "text": spec["text"],
            "instruction": direction,
            "generationParameters": generation,
            "artisticSource": spec.get("artisticSource"),
            "referenceAnalysis": spec.get("referenceAnalysis"),
            "specSha256": hashlib.sha256(
                (PROFILES / args.spec).read_bytes()
            ).hexdigest(),
            "sampleRate": int(sample_rate),
            "durationSeconds": round(duration, 3),
            "gainToAvoidClipping": gain,
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "device": args.device,
            "versions": {
                name: version(name) for name in ["qwen-tts", "torch", "transformers"]
            },
        }
        manifest.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Salvo: {target} ({duration:.1f} s)", flush=True)


if __name__ == "__main__":
    main()
