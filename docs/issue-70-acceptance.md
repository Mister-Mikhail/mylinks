# Issue 70 — icon delivery

## Changes
- Service assets return non-HTML errors and never enter the SPA fallback. HTML has no ETag/Last-Modified and is `no-store`. Snapshot paths use `/i/v2/`, brand assets use their SHA-256 cache key; handled legacy paths redirect with 301. Bare legacy IDs resolve only published, visible references before redirecting.
- The brand library wins before all collection. The ten newly supplied owner assets are preserved byte-for-byte. Other artwork and original sources/checksums are recorded in `public/icons/platforms/brand-assets.json`; three brand assets use documented Wikimedia mirrors because their original hosts were unavailable. No runtime Simple Icons masks or external favicon image URLs.
- PHP curl on Beget is primary (validated DNS, pinned addresses, TLS verification, compression, HTTP/2 when supported, six simultaneous candidates). EU is fallback; one 9.8-second domain budget includes DNS, collection and rasterization. ICO and sanitized SVG become PNG. All usable A/AAAA addresses are queued within bounded work (96 attempts); a first success stops collection.
- Persistent private snapshots live outside public asset delivery, survive deploys, refresh after six hours, and retain the last good PNG on failures. Owner/draft previews use the same collector without requiring publication. First misses produce a globe.
- Featured-card placeholders receive the snapshot. Private owner pages use editor icon delivery; anonymous access to those pages remains blocked.

## Automated acceptance
`bash scripts/ci.sh` runs lint, build, PHP security/conversion/cache tests, Apache route/validator/expired-bundle tests, and the full desktop/mobile Chromium suite. `scripts/test-yandex.sh` runs the real official Yandex stable binary against brand priority, owner published/private, refresh, anonymous snapshot and fallback cases. Screenshots accompany the CI artifacts; the log prints the actual browser version.

## Owner acceptance after deployment
The PR does not deploy application or Edge Function changes. On release, deploy `supabase/functions/favicon` with JWT verification disabled, then the PHP/client build. Check actual `/mister` links in the owner's Yandex installation (including its extensions/incognito protection) at 1280/390/320 px, plus Safari/Chrome on the actual phone. Confirm Getpower/GetAvto and an ICO-only site; confirm a Russia-only and an EU-only domain on the respective production servers. Fixtures test failover and access-control decisions; they cannot certify a production site's geographic firewall. Keep #70 open until these checks pass.

## Server requirements
PHP curl, GD, DOM/XML, `getent`, `timeout`, and FFmpeg with `svg_pipe`/librsvg support. These match the existing media toolchain; SVG conversion is a hard test failure if unavailable. `.private-assets` must be writable by PHP; Apache denies direct access. PHP errors and misses are `no-store`; base icon addresses revalidate after five minutes and redirect to immutable SHA-256 versions (one year, strong ETag). Editor PNGs are private with five-minute revalidation.

## Review fixes
- `site-icon.php` issues ten-minute domain-bound HMAC addresses only after verified owner JWT and RLS profile lookup; unsigned/forged/expired requests cannot invoke collection. Owner-based rate limits avoid proxy-IP collisions.
- 128×128 snapshots; bounded persistent cache: 1024 entries / 64 MiB, 30-day inactivity expiry, LRU eviction, lock-aware writes, separate access time. Old immutable content versions share this budget.
- Actual PHP HTTP tests cover authorization, expiry/tampering/rate limits, public redirects, immutable content and ETag/304. Unit checks verify all brand assets against one manifest and URL migrations.
