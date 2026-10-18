#!/usr/bin/env bash
# =============================================================================
#  GO-GO Ride - one-time setup of a Hostinger VPS (Ubuntu 22.04 / 24.04)
#
#  Run on the VPS as root, from the folder that holds gogoride-deploy.zip:
#      bash setup-server.sh yourdomain.com you@example.com
#
#  It installs Python, nginx and a free HTTPS certificate (Let's Encrypt),
#  unpacks the API + website, and runs the API as a service that restarts by
#  itself. Running it again is safe: it keeps the existing .env, database and
#  uploaded files.
# =============================================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR=/opt/gogoride
PKG="$(pwd)/gogoride-deploy.zip"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: bash setup-server.sh yourdomain.com you@example.com"
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (Hostinger VPS: log in as root, or use sudo)."
  exit 1
fi
if [[ ! -f "$PKG" ]]; then
  echo "gogoride-deploy.zip not found in $(pwd). Upload it first (see README)."
  exit 1
fi

step() { echo; echo "==> $*"; }

step "Time zone -> Asia/Kolkata (bus alarms use the server clock)"
timedatectl set-timezone Asia/Kolkata

step "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-venv python3-pip nginx certbot python3-certbot-nginx unzip ufw openssl

step "Creating service user and folders"
id gogoride >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin gogoride
mkdir -p "$APP_DIR"

step "Unpacking the app"
TMP=$(mktemp -d)
unzip -q -o "$PKG" -d "$TMP"
mkdir -p "$APP_DIR/backend" "$APP_DIR/website"
# Code is replaced; .env, the database and uploads are kept if they already exist.
rm -rf "$APP_DIR/backend/app"
cp -r "$TMP/backend/app" "$TMP/backend/requirements.txt" "$APP_DIR/backend/"
[[ -f "$TMP/backend/.env.example" ]] && cp "$TMP/backend/.env.example" "$APP_DIR/backend/"
if [[ ! -f "$APP_DIR/backend/gogoride.db" && -f "$TMP/backend/gogoride.db" ]]; then
  cp "$TMP/backend/gogoride.db" "$APP_DIR/backend/"
  echo "    copied the starting database (first install)"
fi
mkdir -p "$APP_DIR/backend/uploads"
if [[ -d "$TMP/backend/uploads" ]]; then cp -rn "$TMP/backend/uploads/." "$APP_DIR/backend/uploads/" || true; fi
rm -rf "$APP_DIR/website"
cp -r "$TMP/website" "$APP_DIR/website"
rm -rf "$TMP"

step "Production settings (.env)"
if [[ ! -f "$APP_DIR/backend/.env" ]]; then
  cat > "$APP_DIR/backend/.env" <<EOF
ENVIRONMENT=production
PORT=8000
API_PREFIX=/api
# Website + Android app (Capacitor serves the app from https://localhost)
CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN,https://localhost,capacitor://localhost
DATABASE_URL=sqlite:///$APP_DIR/backend/gogoride.db
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
OTP_DEV_ECHO=false
EOF
  echo "    created $APP_DIR/backend/.env with new random secrets"
else
  echo "    keeping existing $APP_DIR/backend/.env"
fi

step "Python environment"
python3 -m venv "$APP_DIR/backend/.venv"
"$APP_DIR/backend/.venv/bin/pip" install --upgrade pip >/dev/null
"$APP_DIR/backend/.venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt"
chown -R gogoride:gogoride "$APP_DIR"
chmod 600 "$APP_DIR/backend/.env"

step "API service (systemd)"
cat > /etc/systemd/system/gogoride-api.service <<EOF
[Unit]
Description=GO-GO Ride API
After=network.target

[Service]
User=gogoride
Group=gogoride
WorkingDirectory=$APP_DIR/backend
Environment=TZ=Asia/Kolkata
# One worker on purpose: the alarm scheduler runs inside the API process,
# so more workers would send every reminder more than once.
ExecStart=$APP_DIR/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable gogoride-api
systemctl restart gogoride-api

step "Web server (nginx)"
cat > /etc/nginx/sites-available/gogoride <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root $APP_DIR/website;
    index index.html;
    client_max_body_size 6m;   # bus documents / photos are up to 5 MB

    # API + uploaded files -> FastAPI
    location /api/     { proxy_pass http://127.0.0.1:8000; include /etc/nginx/proxy_params; }
    location /uploads/ { proxy_pass http://127.0.0.1:8000; include /etc/nginx/proxy_params; }
    location = /docs   { proxy_pass http://127.0.0.1:8000; include /etc/nginx/proxy_params; }

    # Cache built assets (their names change on every build)
    location /assets/  { expires 30d; add_header Cache-Control "public, immutable"; try_files \$uri =404; }

    # Single-page app: every other path serves index.html
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF
ln -sf /etc/nginx/sites-available/gogoride /etc/nginx/sites-enabled/gogoride
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

step "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/    /'

step "HTTPS certificate (Let's Encrypt)"
echo "    This registers $EMAIL with Let's Encrypt and accepts their terms:"
echo "    https://letsencrypt.org/repository/  (the domain's DNS must already point here)"
if certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --redirect --agree-tos -m "$EMAIL" --non-interactive; then
  SCHEME=https
else
  echo "    !! Certificate failed. Check that both $DOMAIN and www.$DOMAIN point to this"
  echo "       server's IP (Hostinger: Domains -> DNS / Nameservers), wait for DNS, then run:"
  echo "       certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect -m $EMAIL --agree-tos"
  SCHEME=http
fi

step "Checking"
sleep 2
if curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then echo "    API: running"; else echo "    API: NOT running - see: journalctl -u gogoride-api -n 50"; fi

cat <<EOF

===============================================================
 GO-GO Ride is deployed
   Website : $SCHEME://$DOMAIN
   Admin   : $SCHEME://$DOMAIN/admin/login
   API     : $SCHEME://$DOMAIN/api   <- use this for the Android app build
 IMPORTANT - do these now:
   1. Log in as each demo admin and CHANGE THE PASSWORD
      (the starting database has the demo accounts with public passwords).
   2. Block or delete the demo passenger / owner / driver accounts.
 Logs:     journalctl -u gogoride-api -f
 Restart:  systemctl restart gogoride-api
===============================================================
EOF
