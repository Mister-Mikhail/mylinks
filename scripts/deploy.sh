#!/usr/bin/env bash
# Uploads dist/ to Beget over FTP and checks that mylinks.bar serves the new build.
# Needs: BEGET_FTP_HOST, BEGET_FTP_USER, BEGET_FTP_PASSWORD; optional BEGET_FTP_DIR.
set -euo pipefail

HOST="${BEGET_FTP_HOST:-}"; USER_NAME="${BEGET_FTP_USER:-}"; PASS="${BEGET_FTP_PASSWORD:-}"
REMOTE_DIR="${BEGET_FTP_DIR:-}"
SITE_URL="${SITE_URL:-https://mylinks.bar}"

if [ -z "$HOST" ] || [ -z "$USER_NAME" ] || [ -z "$PASS" ]; then
  echo "Secrets BEGET_FTP_HOST / BEGET_FTP_USER / BEGET_FTP_PASSWORD are not set"; exit 1
fi
# Tolerate a host written as ftp://host/ or with spaces
HOST="$(echo "$HOST" | sed -E 's#^[a-z]+://##; s#/.*$##; s/[[:space:]]//g')"
echo "FTP host: $HOST (user: $USER_NAME)"

echo "== Network check"
getent hosts "$HOST" || echo "DNS lookup failed for $HOST"
for port in 21 22; do
  if timeout 10 bash -c "</dev/tcp/$HOST/$port" 2>/dev/null; then echo "port $port: open"; else echo "port $port: closed/timeout"; fi
done

sudo apt-get install -y -qq lftp > /dev/null

ftp() { # ftp <tls yes|no> <commands...>
  local tls="$1"; shift
  timeout "${FTP_TIMEOUT:-120}" lftp -u "$USER_NAME","$PASS" "$HOST" -e "
    set ftp:ssl-allow $tls
    set ssl:verify-certificate no
    set ftp:passive-mode on
    set net:timeout 15
    set net:max-retries 5
    set net:reconnect-interval-base 5
    set net:persist-retries 0
    set cmd:fail-exit yes
    $*
    bye"
}

echo "== Login check"
TLS=""
for mode in yes no; do
  if listing=$(FTP_TIMEOUT=60 ftp "$mode" "cls -1" 2>&1); then TLS="$mode"; break; fi
  echo "login with TLS=$mode failed:"; echo "$listing" | grep -v -i pass | tail -n 15
done
[ -n "$TLS" ] || { echo "Cannot log in to FTP"; exit 1; }
echo "Logged in (TLS=$TLS). Remote root contains:"; echo "$listing" | head -n 30

if [ -z "$REMOTE_DIR" ]; then
  if echo "$listing" | grep -qx 'index.html'; then REMOTE_DIR="."
  elif echo "$listing" | grep -qx 'public_html/\?'; then REMOTE_DIR="public_html"
  elif echo "$listing" | grep -qx 'mylinks.bar/\?'; then REMOTE_DIR="mylinks.bar/public_html"
  else REMOTE_DIR="."; fi
fi
echo "Upload directory: $REMOTE_DIR"

echo "== Current .htaccess on the server (kept as .htaccess.before-ci once)"
if ftp "$TLS" "cd $REMOTE_DIR; get .htaccess -o server.htaccess" > /dev/null 2>&1; then
  cat server.htaccess
  if ! echo "$listing" | grep -qx '.htaccess.before-ci'; then
    ftp "$TLS" "cd $REMOTE_DIR; put server.htaccess -o .htaccess.before-ci" > /dev/null 2>&1 || true
  fi
else
  echo "(none)"
fi

echo "== Upload"
# New hashed assets and static files first, index.html last,
# so visitors never get an index.html that points to missing files.
# Beget limits parallel FTP sessions per user: 2 streams, no chmod, one full retry.
upload_files() { FTP_TIMEOUT=900 ftp "$TLS" "cd $REMOTE_DIR; mirror -R --parallel=2 --no-perms --exclude-glob index.html --exclude-glob .htaccess --verbose=1 dist/ ./"; }
upload_files || { echo "Retrying upload once..."; sleep 5; upload_files; }
# .htaccess and index.html go last, after every file they refer to is in place.
FTP_TIMEOUT=120 ftp "$TLS" "cd $REMOTE_DIR; put dist/.htaccess -o .htaccess; put dist/index.html -o index.html"
echo "Upload finished"

echo "== Smoke test"
expected=$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1)
live=""
for i in 1 2 3 4 5 6; do
  live=$(curl -fsSL -H 'Cache-Control: no-cache' "$SITE_URL/?v=${GITHUB_SHA:-0}" | grep -o 'assets/index-[^"]*\.js' | head -1 || true)
  [ "$live" = "$expected" ] && break
  sleep 10
done
echo "expected=$expected live=$live"
[ "$live" = "$expected" ] || { echo "Live site does not serve the new build (wrong upload directory?)"; exit 1; }
curl -fsS -o /dev/null "$SITE_URL/$expected" || { echo "Main script is not reachable"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/mister"); echo "/mister -> $code"
[ "$code" = "200" ] || { echo "Profile URL failed (SPA fallback in .htaccess?)"; exit 1; }
echo "Deploy OK"
