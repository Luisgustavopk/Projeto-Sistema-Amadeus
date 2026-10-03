"""Measure explicit source intervals without inferring speaker identity from pitch."""

import argparse
import base64
import hashlib
import json
import math
import urllib.error
import urllib.request
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parent
PROFILES = ROOT.parents[1] / "assets" / "voice-profiles"
REFERENCES = {
    "pC-tNMbvPJU": "Maitê / Kurisu e apresentação",
    "rhnJiSdTwrs": "Maitê / treinamento",
    "aC2CQDHWoAU": "Maitê / portfólio",
    "c2zo3ow4lsc": "Mari / treinamento",
    "0bX1x39FmWE": "Mari / animes",
    "-6MYQZlC6pI": "Aline / animes",
    "mVaRTicXXK4": "Tatiane / portfólio",
    "1r74PzIJl88": "Tatiane / entrevista",
    "sble8lZxtlI": "Tatiane / cena Nami",
}


def read_token():
    path = ROOT.parents[1] / "api" / ".env"
    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() == "STT_SERVICE_TOKEN":
            return value.strip().strip('"').strip("'")
    raise ValueError(
        "STT_SERVICE_TOKEN ausente; não é possível transcrever localmente."
    )


def transcribe(samples, token):
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
    payload = {
        "protocolVersion": "1.0",
        "role": "stt",
        "content": "",
        "dataClass": "local-only",
        "maxTokens": 1000,
        "audio": {
            "pcmBase64": base64.b64encode(pcm).decode(),
            "sampleRate": 16000,
            "channels": 1,
        },
    }
    request = urllib.request.Request(
        "http://127.0.0.1:8001/execute",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return {
                "status": "automatic-unverified",
                "text": json.load(response)["content"],
            }
    except (urllib.error.URLError, TimeoutError):
        return {"status": "unavailable"}


def measure(samples):
    hop, frame = 160, 1024
    f0, voiced, probability = librosa.pyin(
        samples, fmin=65, fmax=600, sr=16000, frame_length=frame, hop_length=hop
    )
    rms = librosa.feature.rms(y=samples, frame_length=frame, hop_length=hop)[0]
    threshold = max(1e-5, float(np.percentile(rms, 95)) * 0.08)
    accepted = voiced & (probability >= 0.1) & (rms > threshold) & np.isfinite(f0)
    pitch = f0[accepted]
    quiet = rms < threshold
    edges = np.diff(np.r_[False, quiet, False].astype(int))
    gaps = []
    for start, end in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)):
        left, right = start * hop / 16000, min(end * hop / 16000, len(samples) / 16000)
        if right - left >= 0.12:
            gaps.append([round(left, 3), round(right, 3)])
    return {
        "interpretation": "Descriptive estimate of this mixed interval; not a verified speaker signature or generation target.",
        "confidenceSensitivity": [
            {
                "minimumProbability": cutoff,
                "coverage": round(float(mask.mean()), 3),
                "medianHz": round(float(np.median(f0[mask])), 1)
                if mask.any()
                else None,
            }
            for cutoff in [0.1, 0.5, 0.8]
            for mask in [
                voiced & (probability >= cutoff) & (rms > threshold) & np.isfinite(f0)
            ]
        ],
        "pitchHz": {
            name: round(float(np.percentile(pitch, percentile)), 1)
            for name, percentile in [("p10", 10), ("median", 50), ("p90", 90)]
        }
        if len(pitch) >= 20
        else None,
        "acceptedPitchFrames": int(accepted.sum()),
        "totalFrames": len(f0),
        "pitchCoverage": round(float(accepted.mean()), 3),
        "rmsDbfs": round(
            float(20 * np.log10(max(1e-12, np.sqrt(np.mean(samples**2))))), 2
        ),
        "energyP90MinusP10Db": round(
            float(
                20
                * np.log10(
                    max(1e-12, np.percentile(rms, 90))
                    / max(1e-12, np.percentile(rms, 10))
                )
            ),
            2,
        ),
        "lowEnergyGapsRelativeSeconds": gaps,
        "lowEnergyGapSeconds": round(sum(b - a for a, b in gaps), 3),
        "pauseInterpretation": "Acoustic low-energy intervals only; music can hide speech pauses.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("O relatório já existe; escolha um nome novo.")
    token = read_token()
    report = {
        "method": "pYIN 65–600 Hz, confidence >= 0.1 with sensitivity at 0.5/0.8, 64 ms frame, 10 ms hop; no gender/pitch speaker selection.",
        "limitations": [
            "No auditory timbre assessment or verified speaker diarization.",
            "Mixes are not clean isolated speech; background music may affect pitch and gaps.",
            "Formants, breathiness, CPPS and syllabic rate are inconclusive and are not estimated.",
            "RMS across separately mastered recordings does not measure vocal effort.",
            "Automatic transcripts guide content boundaries; they do not certify speaker identity.",
        ],
        "sources": [],
    }
    for identifier, label in REFERENCES.items():
        files = [p for p in args.source.glob("*.mp3") if f"[{identifier}]" in p.name]
        if len(files) != 1:
            raise ValueError(f"Referência ausente ou ambígua: {identifier}")
        path = files[0]
        info = sf.info(path)
        if identifier == "pC-tNMbvPJU":
            intervals = [
                (0.0, 6.0, "character-performance-by-transcript"),
                (10.0, info.duration, "self-introduction-by-transcript"),
            ]
            excluded = [
                [6.0, 10.0, "Transition between performance and self-introduction"]
            ]
        else:
            intervals = [
                (
                    round(float(t), 2),
                    round(float(t) + 12, 2),
                    "unverified-speakers-and-background",
                )
                for t in np.linspace(0, info.duration - 12, 3)
            ]
            excluded = "All time outside the three distributed 12-second windows; no full-recording analysis."
        item = {
            "id": identifier,
            "label": label,
            "file": path.name,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "durationSeconds": round(info.duration, 3),
            "sampleRate": info.samplerate,
            "channels": info.channels,
            "excluded": excluded,
            "intervals": [],
        }
        for start, end, context in intervals:
            with sf.SoundFile(path) as audio:
                audio.seek(int(start * info.samplerate))
                samples = audio.read(
                    int((end - start) * info.samplerate),
                    dtype="float32",
                    always_2d=True,
                ).mean(axis=1)
            divisor = math.gcd(info.samplerate, 16000)
            samples = resample_poly(
                samples, 16000 // divisor, info.samplerate // divisor
            )
            interval = {
                "startSeconds": start,
                "endSeconds": round(end, 3),
                "context": context,
                "transcript": transcribe(samples, token),
                "measurements": measure(samples),
            }
            item["intervals"].append(interval)
        report["sources"].append(item)
        print(f"Analisado: {label}", flush=True)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


if __name__ == "__main__":
    main()
