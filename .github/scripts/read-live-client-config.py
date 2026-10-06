"""Reuse the public Supabase client configuration already shipped to visitors."""
import base64
import json
import os
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import urlopen

origin = "https://mylinks.bar"
html = urlopen(origin, timeout=20).read(2 * 1024 * 1024).decode()
queue = re.findall(r'<script[^>]+src=["\x27]([^"\x27]+)', html)
seen = set()
texts = []
while queue and len(seen) < 24:
    url = urljoin(origin, queue.pop(0))
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != "mylinks.bar" or not parsed.path.startswith("/assets/") or not parsed.path.endswith(".js") or url in seen:
        continue
    seen.add(url)
    text = urlopen(url, timeout=20).read(3 * 1024 * 1024).decode()
    texts.append(text)
    queue.extend(urljoin(url, asset) for asset in re.findall(r'["\x27](\.?\.?/[^"\x27]+\.js)["\x27]', text))

bundle = "\n".join(texts)
url = "https://loykiawbqdkitndqkegk.supabase.co"
if url not in bundle:
    raise RuntimeError("The live Supabase project could not be verified")
keys = re.findall(r'sb_publishable_[A-Za-z0-9_-]+', bundle)
if not keys:
    for candidate in re.findall(r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', bundle):
        try:
            payload = candidate.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
            if claims.get("role") == "anon" and claims.get("ref") == "loykiawbqdkitndqkegk":
                keys.append(candidate)
        except (ValueError, KeyError):
            continue
if len(set(keys)) != 1:
    raise RuntimeError("A single public client key could not be verified")
values = {"VITE_SUPABASE_URL": url, "VITE_SUPABASE_PUBLISHABLE_KEY": keys[0]}
text = "".join(f"{name}={value}\n" for name, value in values.items())
Path(".env.local").write_text(text)
with open(os.environ["GITHUB_ENV"], "a") as output:
    output.write(text)
print("Verified the existing live public client configuration; no backend secrets used")
