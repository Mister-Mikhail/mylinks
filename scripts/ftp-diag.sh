#!/usr/bin/env bash
# One-off probes for files the FTP server refuses (sourced by deploy.sh; uses its ftp()).
# Usage: ftp_diag <path inside dist>
ftp_diag() {
  set +e
  local path="$1" name; name=$(basename "$path")
  show() { grep -v -i -E 'pass|user ' | grep -E '^(<---|put:|mirror:|ls:|cls:)|^[-dl]r' | tail -n "${1:-8}"; }
  echo "### $path ($(stat -c %s "dist/$path") bytes)"
  echo "-- server listing for this name"
  FTP_TIMEOUT=30 ftp yes "cd $REMOTE_DIR; cls -l $(dirname "$path")/" 2>&1 | grep -F "$name" || echo "(not on server)"
  echo "-- same content, other name"
  FTP_TIMEOUT=60 ftp yes "set net:max-retries 1; debug 3; cd $REMOTE_DIR; put dist/$path -o $(dirname "$path")/zz-probe-$$.tmp" 2>&1 | show || true
  echo "-- random bytes, same size, same name"
  head -c "$(stat -c %s "dist/$path")" /dev/urandom > probe.bin
  FTP_TIMEOUT=60 ftp yes "set net:max-retries 1; debug 3; cd $REMOTE_DIR; put probe.bin -o $path" 2>&1 | show || true
  echo "-- TLS on control only, plain data"
  FTP_TIMEOUT=60 ftp yes "set ftp:ssl-protect-data no; set net:max-retries 1; debug 3; cd $REMOTE_DIR; put dist/$path -o $path" 2>&1 | show || true
  echo "-- no TLS"
  FTP_TIMEOUT=60 ftp no "set net:max-retries 1; debug 3; cd $REMOTE_DIR; put dist/$path -o $path" 2>&1 | show || true
  echo "-- SFTP (port 22) with the same login"
  timeout 60 lftp -u "$USER_NAME","$PASS" "sftp://$HOST" -e "set sftp:auto-confirm yes; set net:max-retries 1; ls -d . ; bye" 2>&1 | grep -v -i pass | tail -n 4 || true
  echo "-- gzip-compressed copy"
  gzip -9c "dist/$path" > probe.gz
  FTP_TIMEOUT=60 ftp yes "set net:max-retries 1; debug 3; cd $REMOTE_DIR; put probe.gz -o $(dirname "$path")/zz-probe-$$.gz" 2>&1 | show || true
  FTP_TIMEOUT=30 ftp yes "cd $REMOTE_DIR; rm -f $(dirname "$path")/zz-probe-$$.tmp $(dirname "$path")/zz-probe-$$.gz" > /dev/null 2>&1 || true
}
