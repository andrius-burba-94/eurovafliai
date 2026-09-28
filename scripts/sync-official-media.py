#!/usr/bin/env python3
"""Install the permitted EuroLeague imagery on the VPS, outside the checkout.

The checked-in manifest records official source URLs. Image bytes stay in the
VPS media directory and are never committed or copied back to a workstation.
Run on the VPS after deployment: python3 scripts/sync-official-media.py
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import pathlib
import re
import tempfile
import time
import urllib.parse
import urllib.request


MANIFEST = pathlib.Path(__file__).resolve().parents[1] / "data/official-media/E2026.json"
ROOT = pathlib.Path("/srv/eurovafliai-media")
HOSTS = {"media-cdn.cortextech.io", "media-cdn.incrowdsports.com"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
WEBP_SIGNATURE = b"RIFF"
MAX_BYTES = 4_000_000


def install(entry: dict[str, str], kind: str, root: pathlib.Path) -> str:
    code = entry["code"]
    url = entry["url"]
    if not re.fullmatch(r"[A-Za-z0-9]{2,12}", code):
        raise ValueError(f"Invalid {kind} code: {code!r}")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in HOSTS or not parsed.path.endswith(".png"):
        raise ValueError(f"Unexpected {kind} image source for {code}")

    portrait = kind == "players"
    if portrait:
        url += "?width=160&resizeType=fill&format=webp"
    signature = WEBP_SIGNATURE if portrait else PNG_SIGNATURE
    destination = root / "E2026" / kind / f"{code}.{'webp' if portrait else 'png'}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.read_bytes().startswith(signature):
        return "existing"

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Eurovafliai/1.0 (non-commercial fantasy league)"})
            with urllib.request.urlopen(request, timeout=25) as response:
                if response.headers.get_content_type() != ("image/webp" if portrait else "image/png"):
                    raise ValueError(f"Unexpected image format for {kind}/{code}")
                content = response.read(MAX_BYTES + 1)
            if len(content) > MAX_BYTES or not content.startswith(signature) or (portrait and content[8:12] != b"WEBP"):
                raise ValueError(f"Invalid image for {kind}/{code}")
            with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temporary:
                temporary.write(content)
                temporary_path = pathlib.Path(temporary.name)
            os.chmod(temporary_path, 0o644)
            temporary_path.replace(destination)
            return "downloaded"
        except Exception as error:
            last_error = error
            time.sleep(1 + attempt)
    raise RuntimeError(f"Could not fetch {kind}/{code}: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, default=ROOT)
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    if manifest["season"] != "E2026":
        raise ValueError("Manifest season mismatch")
    work = [(entry, kind) for kind in ("players", "clubs") for entry in manifest[kind]]
    failures: list[str] = []
    totals = {"existing": 0, "downloaded": 0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(install, entry, kind, args.root) for entry, kind in work]
        for (entry, kind), future in zip(work, futures, strict=True):
            try:
                totals[future.result()] += 1
            except Exception as error:
                failures.append(str(error))
    print(f"EuroLeague E2026 media: {totals['downloaded']} downloaded, {totals['existing']} already present, {len(failures)} failed")
    for failure in failures:
        print(f"ERROR: {failure}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
