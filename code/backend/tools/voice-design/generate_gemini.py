"""Create original Gemini personas and audition the same text with each identity."""

import argparse
import base64
import hashlib
import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROFILES = ROOT.parents[1] / "assets" / "voice-profiles"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/"


def read_key():
    for line in (
        (ROOT.parents[1] / "api" / ".env").read_text(encoding="utf-8").splitlines()
    ):
        key, separator, value = line.partition("=")
        if separator and key.strip() == "GEMINI_API_KEY":
            result = value.strip().strip('"').strip("'")
            if result:
                return result
    raise ValueError("GEMINI_API_KEY ausente no ambiente local da API.")


def request_json(endpoint, key, payload):
    request = urllib.request.Request(
        BASE_URL + endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            body = json.load(error).get("error", {})
            detail = str(body.get("message", "Erro do provedor")).replace(
                key, "[REDACTED]"
            )[:1000]
        except (ValueError, AttributeError):
            detail = "Resposta sem detalhes JSON."
        raise RuntimeError(f"Gemini HTTP {error.code}: {detail}") from None


def write_json(path, data):
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def decode_wav(audio):
    mime = audio.get("mime_type", audio.get("mimeType"))
    if mime not in ["audio/wav", "audio/x-wav"]:
        raise ValueError(f"Formato de áudio inesperado: {mime}")
    raw = base64.b64decode(audio["data"], validate=True)
    if len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError("O provedor não retornou um WAV RIFF válido.")
    return raw


def synthesis_audio(response):
    if response.get("output_audio"):
        return response["output_audio"]
    found = [
        content
        for step in response.get("steps", [])
        if step.get("type") == "model_output"
        for content in step.get("content", [])
        if content.get("type") == "audio"
    ]
    if len(found) != 1:
        raise ValueError("Síntese sem um único bloco de áudio final; saída não salva.")
    return found[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate")
    parser.add_argument("--spec", default="gemini-round-1.json")
    parser.add_argument("--round", default="gemini-round-1")
    args = parser.parse_args()
    for value in [args.spec, args.round]:
        if Path(value).name != value or value in [".", ".."]:
            parser.error("Use nomes locais, sem diretórios.")
    spec_path = PROFILES / args.spec
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    if "\ufffd" in spec["text"] or re.search(r"\w\?\w|\?{2,}", spec["text"]):
        parser.error(
            "O texto contém sinais de perda de codificação; corrija o UTF-8 antes de gerar."
        )
    selected = [
        c for c in spec["candidates"] if not args.candidate or c["id"] == args.candidate
    ]
    if not selected:
        parser.error("Candidata desconhecida.")
    output = PROFILES / "candidates" / args.round
    previews = output / "previews"
    previews.mkdir(parents=True, exist_ok=True)
    for candidate in selected:
        if not re.fullmatch(r"[a-z0-9-]{1,64}", candidate["id"]):
            parser.error("Identificador de candidata inválido.")
        if any(
            (output / f"{candidate['id']}.{suffix}").exists()
            for suffix in ["wav", "json"]
        ):
            parser.error("Amostra já existe; não será substituída.")
    key = read_key()
    for candidate in selected:
        identifier = candidate["id"]
        creation_file = output / f"{identifier}.creation.json"
        if creation_file.exists():
            creation = json.loads(creation_file.read_text(encoding="utf-8"))
        else:
            print(f"Criando identidade original: {candidate['name']}...", flush=True)
            voice = {
                "type": "prompted",
                "display_name": f"Amadeus audition {identifier}",
                "gender": "female",
                "language_code": "pt-BR",
                "accent": "Brazilian Portuguese",
                "pitch": candidate.get("pitch", "medium"),
                "prompted": {"input": candidate["direction"]},
            }
            creation_model = spec.get("creationModel", spec["model"])
            if creation_model != "provider-default":
                voice["model"] = creation_model
            creation = request_json(
                "voices",
                key,
                {"store": True, "voice": voice},
            )
            preview = creation.pop("sample_audio", None)
            if preview is None:
                preview = creation.get("prompted", {}).pop("sample_audio", None)
            # Persist identity immediately so a synthesis retry does not create another voice.
            write_json(creation_file, creation)
            if preview:
                (previews / f"{identifier}.wav").write_bytes(decode_wav(preview))
        voice_id = creation.get("id")
        if not isinstance(voice_id, str) or not voice_id.startswith("voice_"):
            raise ValueError("Criação sem ID de identidade vocal original.")
        if creation.get("prompted", {}).get("input") != candidate["direction"]:
            raise ValueError(
                "A identidade salva pertence a outro prompt; use uma nova candidata."
            )
        content = {"type": "text", "text": spec["text"]}
        speech_style = candidate.get("speechStyle", spec.get("speechStyle"))
        if speech_style:
            content["annotations"] = [
                {"type": "speech_metadata", "style": speech_style}
            ]
        print(f"Sintetizando a frase comum: {candidate['name']}...", flush=True)
        result = request_json(
            "interactions",
            key,
            {
                "model": spec["model"],
                "input": [
                    {
                        "type": "user_input",
                        "content": [content],
                    }
                ],
                "response_format": {"type": "audio", "mime_type": "audio/wav"},
                "generation_config": {"speech_config": [{"voice": voice_id}]},
            },
        )
        raw = decode_wav(synthesis_audio(result))
        target = output / f"{identifier}.wav"
        target.write_bytes(raw)
        write_json(
            target.with_suffix(".json"),
            {
                "status": "awaiting-listening-and-selection",
                "creationMethod": "text-description",
                "referenceAudioUsed": spec.get("referenceAudioUploaded", False),
                "referenceAudioUsedForConditioning": False,
                "referenceAudioUploaded": spec.get("referenceAudioUploaded", False),
                "candidate": candidate,
                "model": spec["model"],
                "creationModel": creation.get("model"),
                "requestedCreationModel": spec.get("creationModel", spec["model"]),
                "language": "pt-BR",
                "region": "BR",
                "voiceId": voice_id,
                "text": spec["text"],
                "speechStyle": speech_style,
                "instruction": creation.get("prompted", {}).get(
                    "input", candidate["direction"]
                ),
                "creationPromptMatchesCurrentSpec": creation.get("prompted", {}).get(
                    "input"
                )
                == candidate["direction"],
                "artisticSource": spec["artisticSource"],
                "referenceAnalysis": spec["referenceAnalysis"],
                "specSha256": hashlib.sha256(spec_path.read_bytes()).hexdigest(),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "usage": result.get("usage"),
                "billingTier": "not-exposed-by-api; published free tier exists; no paid fallback requested",
                "createdAt": datetime.now(timezone.utc).isoformat(),
            },
        )
        print(f"Salvo: {target}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        print(str(error), flush=True)
        raise SystemExit(1) from None
