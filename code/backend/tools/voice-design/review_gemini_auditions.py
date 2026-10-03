"""Reassess authorized source excerpts against rejected auditions, without cloning."""

import argparse
import base64
import hashlib
import json
from pathlib import Path

from analyze_gemini_references import clip_audio
from generate_gemini import PROFILES, read_key, request_json, write_json

GROUPS = {
    "maite": {
        "references": [
            ("pC-tNMbvPJU", 0, 6),
            ("pC-tNMbvPJU", 10, 21.014),
            ("aC2CQDHWoAU", 0, 30),
            ("rhnJiSdTwrs", 30, 60),
            ("-6MYQZlC6pI", 0, 20),
        ],
        "previous": ["g3a-frontal-seca", "g3b-brilho-agil"],
        "directions": ["g4a-base", "g4b-brilho"],
        "focus": "The pC acting clip is the main direction. Its self-introduction is a separate delivery. aC and rhn are secondary checks for conversational texture; the Aline portfolio -6M is secondary ONLY for the second, blended direction.",
    },
    "mari": {
        "references": [
            ("0bX1x39FmWE", 0, 45.12),
            ("c2zo3ow4lsc", 0, 30),
            ("c2zo3ow4lsc", 110, 140),
            ("mVaRTicXXK4", 130, 150),
        ],
        "previous": ["g3c-clareza-central", "previews/g3d-firme-dinamica"],
        "directions": ["g4c-leve", "g4d-corpo"],
        "focus": "Use clear adult dialogue in 0bX as the main direction. c2zo provides additional conversational texture. mVa is secondary ONLY for the second, blended direction. Previous D is a provider preview with a different text and some clipped peaks; do not infer all grain or character texture comes from clipping.",
    },
}

PROMPT = """Listen to the supplied audio to reassess an ORIGINAL character voice design.
Source labels indicate supplied performance portfolios, not verified speaker diarization.
Do not identify people by voice or assume that all speech in a portfolio is one performer.
Select useful dialogue stretches from the references using relative timestamps and a short
word anchor (at most 3 words each). Mark other speakers, music, effects, singing and ambiguity.
The task-specific source priorities are supplied below. Use ONLY the exact labels supplied
alongside the audio. Never mention a candidate or source that was not attached to this request.

Do not just repeat the prior report or the user's opinion. Compare the AUDIO of the previous
candidates with useful references, stating audible timbre and phrasing differences separately.
The user rejected the previous complete candidates as far from the references and too generic.
If an earlier description of metallic/nasal/dry/light texture was exaggerated or unsupported,
correct it. Avoid assigning intelligence or character traits from the sound of real people.
Do not invent measurements or physiological explanations. State remaining uncertainty.

Propose TWO original identities, a primary-source broad-style direction and a blended direction.
Use concise English identity descriptions, TWO sentences, 35-65 words each, limited to permanent
voice traits and native Brazilian Portuguese pronunciation. Describe audible timbre before
personality. Put situational acting in a separate short speechStyle string. Do not use personal
names, exact imitation, speaker embeddings or reference conditioning. Portuguese explanatory
fields. The text to audition remains the same as the previous complete candidates.
Return JSON: selectedSegments [{label,startSeconds,endSeconds,anchor,reason,uncertainty}],
revisedObservations, previousDifferences [{candidate,timbre,phrasing,uncertainty}],
correctionsToPriorAnalysis, candidateDirections [{id,direction,speechStyle,rationale,evidenceLabels}],
limitations. Use exactly the two IDs given in the input. Leave inconclusive traits inconclusive.
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=GROUPS)
    parser.add_argument("--model", default="gemini-3.8-flash")
    parser.add_argument("--from-response", action="store_true")
    args = parser.parse_args()
    group = GROUPS[args.target]
    target = PROFILES / f"gemini-reference-review-2.{args.target}.json"
    if target.exists():
        raise FileExistsError("Review already exists; retain the original result.")
    sources = json.loads(
        (PROFILES / "reference-analysis-round-3.json").read_text(encoding="utf-8")
    )
    paths = {item["id"]: item for item in sources["sources"]}
    task_prompt = (
        PROMPT
        + "\nSource priorities: "
        + group["focus"]
        + "\nDirection IDs: "
        + ", ".join(group["directions"])
    )
    parts = [{"text": task_prompt}]
    inputs = []
    for source_id, start, end in group["references"]:
        source = paths[source_id]
        path = Path.home() / "Downloads" / source["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Source hash changed.")
        label = f"reference:{source_id}:{start}-{end}"
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
    folder = PROFILES / "candidates" / "gemini-round-3"
    for candidate in group["previous"]:
        raw = (folder / f"{candidate}.wav").read_bytes()
        label = "previous:" + candidate
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
        inputs.append({"label": label, "sha256": hashlib.sha256(raw).hexdigest()})
    response_path = target.with_suffix(".response.json")
    if args.from_response:
        response = json.loads(response_path.read_text(encoding="utf-8"))
    else:
        response = request_json(
            f"models/{args.model}:generateContent",
            read_key(),
            {
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "maxOutputTokens": 8192,
                    "temperature": 0.2,
                },
            },
        )
        write_json(response_path, response)
    analysis = json.loads(
        "".join(
            part.get("text", "")
            for part in response["candidates"][0]["content"]["parts"]
        )
    )
    if isinstance(analysis, list) and len(analysis) == 1:
        analysis = analysis[0]
    if {item["id"] for item in analysis["candidateDirections"]} != set(
        group["directions"]
    ):
        raise ValueError("Unexpected candidate direction IDs.")
    labels = {item["label"] for item in inputs}
    for direction in analysis["candidateDirections"]:
        original_labels = direction["evidenceLabels"]
        resolved = []
        for label in original_labels:
            matches = (
                [label]
                if label in labels
                else [item for item in labels if item.startswith(f"reference:{label}:")]
            )
            if not matches:
                raise ValueError(
                    "The model cited unattached evidence; review rejected."
                )
            resolved.extend(matches)
        direction["originalModelEvidenceLabels"] = original_labels
        direction["evidenceLabels"] = sorted(set(resolved))
    write_json(
        target,
        {
            "status": "automated-perceptual-reassessment; human-review-required",
            "model": args.model,
            "purpose": "analysis-only; original text-described identities",
            "inputs": inputs,
            "prompt": task_prompt,
            "analysis": analysis,
            "usage": response.get("usageMetadata"),
            "auditLimits": "Model timestamps, word anchors and physiological claims are unverified. Source-only evidence labels resolve to all supplied clips of that source, not a proven interval attribution. Causal claims about clipping or prior analyses are not accepted as facts.",
        },
    )
    print(f"Review saved: {target}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        print(str(error), flush=True)
        raise SystemExit(1) from None
