"""Check generated WAV files and compare local ASR with their declared transcript."""

import argparse
import hashlib
import json
import math
import re
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from analyze_references import read_token, transcribe


def words(text):
    normalized = unicodedata.normalize("NFKD", text.casefold())
    return re.findall(
        r"[a-z0-9]+", "".join(c for c in normalized if not unicodedata.combining(c))
    )


def word_error_rate(expected, actual):
    reference, hypothesis = words(expected), words(actual)
    previous = list(range(len(hypothesis) + 1))
    for row, token in enumerate(reference, 1):
        current = [row]
        for column, other in enumerate(hypothesis, 1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[column] + 1,
                    previous[column - 1] + (token != other),
                )
            )
        previous = current
    return round(previous[-1] / max(1, len(reference)), 4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    files = sorted(args.directory.glob("*.wav"))
    if not files:
        parser.error("Nenhuma amostra WAV encontrada.")
    token = read_token()
    results = []
    for path in files:
        metadata = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        info = sf.info(path)
        samples, rate = sf.read(path, dtype="float32", always_2d=True)
        finite = bool(np.isfinite(samples).all())
        peak = float(np.max(np.abs(samples)))
        clipped = int(np.count_nonzero(np.abs(samples) >= 0.999))
        result = {
            "file": path.name,
            "sampleRate": rate,
            "channels": info.channels,
            "subtype": info.subtype,
            "durationSeconds": round(info.duration, 3),
            "finite": finite,
            "peak": round(peak, 5),
            "clippedSamples": clipped,
            "sha256Matches": hashlib.sha256(path.read_bytes()).hexdigest()
            == metadata["sha256"],
        }
        result["technicalPass"] = bool(
            finite
            and 0 < peak < 0.999
            and clipped == 0
            and info.channels == 1
            and info.subtype == "PCM_16"
            and 3 <= info.duration <= 30
            and result["sha256Matches"]
        )
        if not result["technicalPass"]:
            raise ValueError(f"Falha técnica na amostra {path.name}")
        divisor = math.gcd(rate, 16000)
        mono = resample_poly(samples.mean(axis=1), 16000 // divisor, rate // divisor)
        transcript = transcribe(mono, token)
        result["transcript"] = transcript
        result["wordErrorRate"] = (
            word_error_rate(metadata["text"], transcript["text"])
            if "text" in transcript
            else None
        )
        result["listeningStatus"] = "pending-user-accent-identity-and-cutoff-review"
        results.append(result)
        print(f"{path.name}: PCM OK; WER={result['wordErrorRate']}", flush=True)
    report = {
        "method": "Local Whisper transcription; normalized word edit distance. ASR errors may differ from actual speech errors.",
        "limitations": "Does not validate accent, timbre, speaker identity, naturalness or subtle word cutoffs.",
        "samples": results,
    }
    (args.directory / "quality-check.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
