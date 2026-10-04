"""Download pinned, verified local evaluation assets; no system installation."""

import hashlib
import shutil
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
CACHE = ROOT / ".cache" / "local-llm"
ASSETS = [
    (
        "llama-b11146-bin-win-cpu-x64.zip",
        "https://github.com/ggml-org/llama.cpp/releases/download/b11146/llama-b11146-bin-win-cpu-x64.zip",
        "14cf1303ca9ac3abd94816850532f9f9a69ac66fbaca3776fc6f9061c2fac1d1",
    ),
    (
        "Qwen3-1.7B-Q8_0.gguf",
        "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf",
        "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a",
    ),
]


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(CACHE).free < 5 * 1024**3 and any(
        not (CACHE / item[0]).exists() for item in ASSETS
    ):
        raise RuntimeError("At least 5 GiB of free disk space required")
    for filename, url, expected in ASSETS:
        target = CACHE / filename
        if target.exists() and digest(target) == expected:
            print(f"Verified cached asset: {filename}", flush=True)
            continue
        partial = target.with_suffix(target.suffix + ".partial")
        downloaded = 0
        checkpoint = 0
        request = urllib.request.Request(
            url, headers={"User-Agent": "Amadeus-local-eval"}
        )
        with (
            urllib.request.urlopen(request, timeout=60) as response,
            partial.open("wb") as output,
        ):
            while block := response.read(4 * 1024 * 1024):
                output.write(block)
                downloaded += len(block)
                if downloaded - checkpoint >= 128 * 1024 * 1024:
                    print(f"{filename}: {downloaded // (1024**2)} MiB", flush=True)
                    checkpoint = downloaded
        if digest(partial) != expected:
            raise RuntimeError(f"SHA256 mismatch: {filename}")
        partial.replace(target)
        print(f"Verified asset: {filename}", flush=True)
    runtime = CACHE / "runtime"
    runtime.mkdir(exist_ok=True)
    with zipfile.ZipFile(CACHE / ASSETS[0][0]) as archive:
        for member in archive.infolist():
            destination = (runtime / member.filename).resolve()
            if not destination.is_relative_to(runtime.resolve()):
                raise RuntimeError("Invalid archive path")
        archive.extractall(runtime)
    print(f"Runtime prepared: {runtime}", flush=True)


if __name__ == "__main__":
    main()
