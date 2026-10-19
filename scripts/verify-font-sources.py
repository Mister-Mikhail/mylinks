"""Recheck shipped font bytes against pinned Fontsource npm archives (read only)."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "public" / "fonts"


def verify(package):
    slug = package["package"].removeprefix("@fontsource/")
    version = package["version"]
    expected_url = f"https://registry.npmjs.org/@fontsource/{slug}/-/{slug}-{version}.tgz"
    if package["url"] != expected_url:
        raise ValueError(f"Unexpected source URL for {slug}")
    with urlopen(expected_url, timeout=60) as response:
        archive_bytes = response.read()
    if sha256(archive_bytes).hexdigest() != package["tarballSha256"]:
        raise ValueError(f"Archive checksum mismatch: {slug}")
    files = [*package["files"], package["license"]]
    with tarfile.open(fileobj=BytesIO(archive_bytes), mode="r:gz") as archive:
        for entry in files:
            if Path(entry["file"]).name != entry["file"]:
                raise ValueError("Expected a filename without directories")
            local = (FONT_DIR / entry["file"]).read_bytes()
            if sha256(local).hexdigest() != entry["sha256"]:
                raise ValueError(f"Local checksum mismatch: {entry['file']}")
            member = archive.extractfile(entry["source"])
            if member is None or member.read() != local:
                raise ValueError(f"Upstream bytes differ: {entry['file']}")
    return f"{package['package']}@{version}: {len(files)} files match"


if __name__ == "__main__":
    manifest = json.loads((FONT_DIR / "provenance.json").read_text())
    with ThreadPoolExecutor(max_workers=4) as pool:
        for message in pool.map(verify, manifest["packages"]):
            print(message, flush=True)
