#!/usr/bin/env bash
# =============================================================================
#  GO-GO Ride - deploy a new version to the VPS (after setup-server.sh)
#
#  Run on the VPS as root, from the folder that holds the new gogoride-deploy.zip:
#      bash update-server.sh
#
#  Replaces the API code and the website. Keeps .env, the database and uploads.
# =============================================================================
set -euo pipefail

APP_DIR=/opt/gogoride
PKG="$(pwd)/gogoride-deploy.zip"
[[ $EUID -eq 0 ]] || { echo "Please run as root."; exit 1; }
[[ -f "$PKG" ]] || { echo "gogoride-deploy.zip not found in $(pwd)."; exit 1; }
[[ -f "$APP_DIR/backend/.env" ]] || { echo "Run setup-server.sh first."; exit 1; }

TMP=$(mktemp -d)
unzip -q -o "$PKG" -d "$TMP"

echo "==> Backing up the database"
mkdir -p "$APP_DIR/backups"
cp "$APP_DIR/backend/gogoride.db" "$APP_DIR/backups/gogoride-$(date +%Y%m%d-%H%M%S).db"
ls -1t "$APP_DIR"/backups/*.db | tail -n +11 | xargs -r rm --   # keep the last 10

echo "==> Updating API code"
rm -rf "$APP_DIR/backend/app"
cp -r "$TMP/backend/app" "$TMP/backend/requirements.txt" "$APP_DIR/backend/"
"$APP_DIR/backend/.venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt" >/dev/null

echo "==> Updating website"
rm -rf "$APP_DIR/website"
cp -r "$TMP/website" "$APP_DIR/website"
rm -rf "$TMP"

chown -R gogoride:gogoride "$APP_DIR"
systemctl restart gogoride-api
sleep 2
if curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then
  echo "==> Done - API is running"
else
  echo "!! API did not start - see: journalctl -u gogoride-api -n 50"
  exit 1
fi
