"""Send authorized reference excerpts for qualitative audio analysis, not replication."""

import argparse
import base64
import hashlib
import io
import json
import math
import re
from pathlib import Path

import soundfile as sf
from scipy.signal import resample_poly

from generate_gemini import PROFILES, read_key, request_json, write_json

OUTPUT = PROFILES / "gemini-reference-analysis-1.json"
PROMPT = """Analyze the attached AUDIO itself to inform an ORIGINAL character voice.
The user rejects our previous G1/G2/G3 samples as generic AI feminine voices with little identity.
Reference source pC-tNMbvPJU 0-6s is the PRIMARY character-performance direction. Its 10-21s
excerpt is a self-introduction, a different delivery; distinguish acting from baseline texture.
Other sources are SECONDARY comparisons and may contain music, different characters, singing,
interviewers or other speakers. Do not attribute all voices within a clip to one person.
Do not identify people from voice. Do not use names of actors/characters in design prompts.
Do not request replication or reference-audio conditioning. The output is a description-based
new identity with broad perceptual traits, not an exact imitation of an existing speaker.

For each labeled excerpt, report brief supporting word anchors/times relative to that excerpt,
speaker/background ambiguity and what can be heard about resonance (front/back, nasal/oral,
bright/dark), vocal weight, texture/edge, vowel shape, consonant attacks, cadence and emphasis.
Do not invent acoustic measurements, exact formants, pitch Hz or unsupported physiological facts.
Distinguish observations from artistic choices. Mark contaminated evidence as uncertain.
Then compare the PRIMARY clip against G1/G2/G3: give specific audible differences rather than
merely repeating the user's complaint. Does the difference arise from timbre, phrasing, or both?

Return JSON with these keys:
clips: array of {label, observations, anchors, uncertainty}; one entry per supplied label.
primaryProfile: {stableTimbreTraits, performanceTraits, evidenceLimits}.
comparisonToPrevious: array of {candidate, specificDifferences, uncertainty}.
directionChanges: concrete actionable traits, ranked by usefulness, avoiding vague personality words.
candidateDirections: EXACTLY TWO objects {id, name, pitch, direction, rationale, evidenceLabels}.
Use ids ga2-textura and gb2-presenca; English direction prompts, other explanations in Portuguese.
The two directions must meaningfully differ in vocal identity, not merely emotional delivery.
Both must be original young-adult feminine character voices in native pt-BR, suitable for a
thoughtful scientific character with dry wit. Prioritize the primary clip; use other clips to
avoid excessively childish, neutral-assistant or heavily breathy results. Include distinctive
texture and resonance only if the audio supports them. Do not flatten the voice into a generic
warm/smooth female narrator. Keep each direction between 90 and 150 words; lead with timbre
and placement. Do not embed personal names, source filenames or exact imitation instructions.
State whether your proposed direction might exaggerate any trait beyond the recordings.
This is a model-generated perceptual assessment, not a human listening verdict.
"""


def clip_audio(path, start, end):
    with sf.SoundFile(path) as audio:
        rate = audio.samplerate
        audio.seek(int(start * rate))
        samples = audio.read(
            int((end - start) * rate), dtype="float32", always_2d=True
        ).mean(axis=1)
    divisor = math.gcd(rate, 16000)
    samples = resample_poly(samples, 16000 // divisor, rate // divisor)
    buffer = io.BytesIO()
    sf.write(buffer, samples, 16000, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--batch",
        choices=["primary", "support1", "support2", "support3"],
        default="primary",
    )
    parser.add_argument("--assemble", action="store_true")
    parser.add_argument("--from-response", action="store_true")
    parser.add_argument(
        "--model",
        choices=["gemini-3.8-flash", "gemini-3-flash-preview", "gemini-2.5-flash"],
        default="gemini-3.8-flash",
    )
    args = parser.parse_args()
    if args.assemble:
        batches = [
            json.loads(
                OUTPUT.with_name(f"gemini-reference-analysis-1.{name}.json").read_text(
                    encoding="utf-8"
                )
            )
            for name in ["primary", "support1", "support2", "support3"]
        ]
        combined = dict(batches[0])
        combined["analysis"]["clips"] = [
            clip for batch in batches for clip in batch["analysis"]["clips"]
        ]
        combined["analysis"]["secondaryImplications"] = [
            batch["analysis"].get("secondaryImplications") for batch in batches[1:]
        ]
        combined["inputs"] = [item for batch in batches for item in batch["inputs"]]
        combined["usage"] = [batch.get("usage") for batch in batches]
        combined["analysisMethod"] = (
            "Primary/previous comparison plus three independent secondary batches; initial all-in-one request timed out."
        )
        if (
            len(combined["analysis"]["clips"]) != 26
            or len(combined["analysis"]["comparisonToPrevious"]) != 3
        ):
            raise ValueError(
                "A montagem não contém as 26 referências e três comparações."
            )
        write_json(OUTPUT, combined)
        print(f"Análise montada: {OUTPUT}", flush=True)
        return
    target = OUTPUT.with_name(f"gemini-reference-analysis-1.{args.batch}.json")
    if target.exists():
        raise FileExistsError("A análise já existe; não será substituída.")
    local = json.loads(
        (PROFILES / "reference-analysis-round-3.json").read_text(encoding="utf-8")
    )
    parts = [{"text": PROMPT}]
    inputs = []
    for source in local["sources"]:
        path = Path.home() / "Downloads" / source["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("A referência foi alterada após a análise local.")
        for interval in source["intervals"]:
            start, end = interval["startSeconds"], interval["endSeconds"]
            label = f"reference:{source['id']}:{start}-{end}"
            raw = clip_audio(path, start, end)
            parts.extend(
                [
                    {"text": label},
                    {
                        "inlineData": {
                            "mimeType": "audio/wav",
                            "data": base64.b64encode(raw).decode(),
                        }
                    },
                ]
            )
            inputs.append(
                {
                    "label": label,
                    "source": source["file"],
                    "sourceSha256": source["sha256"],
                    "startSeconds": start,
                    "endSeconds": end,
                    "uploadedClipSha256": hashlib.sha256(raw).hexdigest(),
                }
            )
    previous = PROFILES / "candidates" / "gemini-round-1"
    for candidate in ["g1-equilibrada", "g2-cientista", "g3-expressiva"]:
        path = previous / f"{candidate}.wav"
        raw = path.read_bytes()
        label = f"previous:{candidate}"
        parts.extend(
            [
                {"text": label},
                {
                    "inlineData": {
                        "mimeType": "audio/wav",
                        "data": base64.b64encode(raw).decode(),
                    }
                },
            ]
        )
        inputs.append(
            {"label": label, "uploadedClipSha256": hashlib.sha256(raw).hexdigest()}
        )
    selection = {
        "primary": [0, 1, 26, 27, 28],
        "support1": list(range(2, 10)),
        "support2": list(range(10, 18)),
        "support3": list(range(18, 26)),
    }[args.batch]
    prompt = (
        PROMPT
        if args.batch == "primary"
        else """Analyze these authorized AUDIO excerpts for broad perceptual traits useful in an ORIGINAL feminine character voice. Return JSON {clips: [{label, observations, anchors, uncertainty}], secondaryImplications: [...]} with exactly one entry per supplied label. Describe resonance/placement, texture, consonant attack, vowel shape, cadence and emphasis; separate timbre from acting. Use Portuguese explanations. Do not identify people by voice or assume all speakers are one person. Flag music, singing, other speakers, short exclamations and ambiguous identity. Use brief word/timing anchors within each excerpt. Do not invent Hz/formants or physiological measurements. This is supporting evidence, not a target identity for imitation. Explain broad traits that might be useful and those that are too childish, breathy, sung or exaggerated for a composed scientific character. This is automated perceptual analysis, not a human verdict."""
    )
    parts = [{"text": prompt}] + [
        part for index in selection for part in parts[1 + index * 2 : 3 + index * 2]
    ]
    inputs = [inputs[index] for index in selection]
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": 6144,
        },
    }
    if len(json.dumps(payload).encode()) > 19_000_000:
        raise ValueError("Pedido excede o limite conservador de envio inline.")
    print(f"Analisando {len(inputs)} trechos autorizados com Gemini...", flush=True)
    response = (
        json.loads(target.with_suffix(".response.json").read_text(encoding="utf-8"))
        if args.from_response
        else request_json(f"models/{args.model}:generateContent", read_key(), payload)
    )
    write_json(target.with_suffix(".response.json"), response)
    text = "".join(
        p.get("text", "")
        for c in response.get("candidates", [])
        for p in c.get("content", {}).get("parts", [])
        if not p.get("thought")
    )
    analysis = json.loads(text)
    expected = {x["label"] for x in inputs}
    for clip in analysis.get("clips", []):
        label = clip["label"]
        if label in expected:
            continue
        match = re.fullmatch(r"(?:reference:)?([^:]+):([0-9.]+)-([0-9.]+)", label)
        options = []
        if match:
            identifier, start, end = match.groups()
            options = [
                item["label"]
                for item in inputs
                if item["label"].startswith(f"reference:{identifier}:")
                and abs(item["startSeconds"] - float(start)) < 0.05
                and abs(item["endSeconds"] - float(end)) < 0.05
            ]
        if len(options) != 1:
            raise ValueError(f"Rótulo não corresponde a um intervalo enviado: {label}")
        clip["originalModelLabel"] = label
        clip["label"] = options[0]
    assessed = {x["label"] for x in analysis.get("clips", [])}
    if args.batch == "primary":
        assessed |= {
            f"previous:{x['candidate']}"
            for x in analysis.get("comparisonToPrevious", [])
        }
        if len(analysis.get("candidateDirections", [])) != 2:
            raise ValueError("A análise principal não contém duas direções.")
    if assessed != expected:
        raise ValueError("Análise não cobre os rótulos enviados.")
    analysis["auditLimits"] = (
        "Automated perceptual descriptions only. Word/time anchors and physiological terms are unverified; rounded interval labels normalized within 50 ms."
    )
    write_json(
        target,
        {
            "status": "model-generated-perceptual-analysis-awaiting-human-review",
            "model": args.model,
            "referenceAudioUploadAuthorized": True,
            "purpose": "analysis-only; no replication",
            "inputs": inputs,
            "prompt": prompt,
            "analysis": analysis,
            "usage": response.get("usageMetadata"),
        },
    )
    print(f"Análise salva: {target}", flush=True)


if __name__ == "__main__":
    main()
