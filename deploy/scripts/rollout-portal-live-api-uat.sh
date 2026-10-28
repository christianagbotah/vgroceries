#!/usr/bin/env bash
set -Eeuo pipefail

: "${PORTAL_RELEASE_DIR:?PORTAL_RELEASE_DIR must point to a verified standalone portal release}"
PORTAL_LINK="${PORTAL_LINK:-/home/lightworld/webapps/varietygroceries-portal-current}"
PORTAL_ENV_FILE="${PORTAL_ENV_FILE:-/home/lightworld/config/varietygroceries/portal.env}"
PORTAL_VHOST="${PORTAL_VHOST:-/usr/local/apps/nginx/etc/conf.d/zzz-varietygroceries-portal.conf}"
API_PROXY_TARGET="${API_PROXY_TARGET:-/usr/local/apps/nginx/etc/conf.d/includes/varietygroceries-api-proxy.conf}"
PORTAL_UNIT_TARGET="${PORTAL_UNIT_TARGET:-/etc/systemd/system/varietygroceries-portal.service}"
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="$(mktemp -d /tmp/variety-portal-rollout.XXXXXX)"
OLD_RELEASE="$(readlink -f "$PORTAL_LINK" 2>/dev/null || true)"
ROLLED_BACK=0

reload_nginx() {
  local can_reload
  can_reload="$(systemctl show nginx.service -p CanReload --value 2>/dev/null || true)"
  if [[ "$can_reload" == "yes" ]]; then
    systemctl reload nginx
  elif [[ -x /usr/local/apps/nginx/sbin/nginx && -f /usr/local/apps/nginx/etc/nginx.conf ]]; then
    /usr/local/apps/nginx/sbin/nginx -s reload -c /usr/local/apps/nginx/etc/nginx.conf
  else
    nginx -s reload
  fi
}

backup_if_present() {
  local src="$1" name="$2"
  if [[ -e "$src" || -L "$src" ]]; then cp -a "$src" "$BACKUP_DIR/$name"; fi
}

restore_or_remove() {
  local dst="$1" name="$2"
  if [[ -e "$BACKUP_DIR/$name" || -L "$BACKUP_DIR/$name" ]]; then
    rm -f "$dst"; cp -a "$BACKUP_DIR/$name" "$dst"
  else
    rm -f "$dst"
  fi
}

rollback() {
  [[ "$ROLLED_BACK" == 1 ]] && return 0
  ROLLED_BACK=1
  set +e
  echo "Portal UAT rollout failed; restoring previous runtime." >&2
  if [[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
    ln -sfn "$OLD_RELEASE" "${PORTAL_LINK}.rollback"
    mv -Tf "${PORTAL_LINK}.rollback" "$PORTAL_LINK"
  fi
  restore_or_remove "$PORTAL_ENV_FILE" portal.env
  restore_or_remove "$API_PROXY_TARGET" api-proxy.conf
  restore_or_remove "$PORTAL_VHOST" portal-vhost.conf
  restore_or_remove "$PORTAL_UNIT_TARGET" portal.service
  systemctl daemon-reload >/dev/null 2>&1 || true
  systemctl restart varietygroceries-portal.service >/dev/null 2>&1 || true
  nginx -t >/dev/null 2>&1 && reload_nginx >/dev/null 2>&1 || true
  rm -rf "$BACKUP_DIR"
}
trap rollback ERR INT TERM

[[ "$(id -u)" == 0 ]] || { echo "Run as root." >&2; exit 1; }
[[ -f "$PORTAL_RELEASE_DIR/server.js" ]] || { echo "Verified standalone release is missing server.js: $PORTAL_RELEASE_DIR" >&2; exit 1; }
[[ -f "$PORTAL_VHOST" ]] || { echo "Portal Nginx vhost missing: $PORTAL_VHOST" >&2; exit 1; }

backup_if_present "$PORTAL_ENV_FILE" portal.env
backup_if_present "$API_PROXY_TARGET" api-proxy.conf
backup_if_present "$PORTAL_VHOST" portal-vhost.conf
backup_if_present "$PORTAL_UNIT_TARGET" portal.service

ADSENSE_ENV_LINES=""
if [[ -f "$PORTAL_ENV_FILE" ]]; then
  ADSENSE_ENV_LINES="$(grep -E '^(ADSENSE_CLIENT|NEXT_PUBLIC_ADSENSE_CLIENT|NEXT_PUBLIC_ADSENSE_HOME_TOP_SLOT|NEXT_PUBLIC_ADSENSE_HOME_MID_SLOT|NEXT_PUBLIC_ADSENSE_HOME_BOTTOM_SLOT|NEXT_PUBLIC_ADSENSE_SHOP_TOP_SLOT)=' "$PORTAL_ENV_FILE" || true)"
fi

install -d -o lightworld -g lightworld -m 0750 "$(dirname "$PORTAL_ENV_FILE")"
cat > "$PORTAL_ENV_FILE" <<'ENV'
API_BASE_URL=http://127.0.0.1:3027/api/v1
NEXT_PUBLIC_API_BASE_URL=https://portal.varietygroceries.com/api/v1
UAT_DEMO_LOGIN=1
ENV
if [[ -n "$ADSENSE_ENV_LINES" ]]; then printf '%s\n' "$ADSENSE_ENV_LINES" >> "$PORTAL_ENV_FILE"; fi
chown lightworld:lightworld "$PORTAL_ENV_FILE"
chmod 0640 "$PORTAL_ENV_FILE"

install -m 0644 "$SOURCE_ROOT/deploy/nginx/varietygroceries-api-proxy.conf" "$API_PROXY_TARGET"
install -m 0644 "$SOURCE_ROOT/deploy/systemd/varietygroceries-portal.service" "$PORTAL_UNIT_TARGET"

python3 - "$PORTAL_VHOST" "$API_PROXY_TARGET" <<'PY'
from pathlib import Path
import sys
vhost = Path(sys.argv[1])
include_path = sys.argv[2]
line = f"    include {include_path};"
s = vhost.read_text()
if line not in s:
    marker = "    include /usr/local/apps/nginx/etc/conf.d/includes/varietygroceries-product-media.conf;"
    if marker in s:
        s = s.replace(marker, marker + "\n" + line, 1)
    elif "    location / {" in s:
        s = s.replace("    location / {", line + "\n\n    location / {", 1)
    else:
        raise SystemExit("Could not locate a safe insertion point in the portal vhost")
    vhost.write_text(s)
PY

chown -R lightworld:lightworld "$PORTAL_RELEASE_DIR"
find "$PORTAL_RELEASE_DIR" -type d -exec chmod 0755 {} +
find "$PORTAL_RELEASE_DIR" -type f -exec chmod 0644 {} +
install -d -o lightworld -g lightworld -m 0755 "$PORTAL_RELEASE_DIR/.next/cache"

ln -sfn "$PORTAL_RELEASE_DIR" "${PORTAL_LINK}.next"
mv -Tf "${PORTAL_LINK}.next" "$PORTAL_LINK"

nginx -t
reload_nginx
systemctl daemon-reload
systemctl enable varietygroceries-portal.service >/dev/null
systemctl restart varietygroceries-portal.service

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3037/ >/dev/null; then break; fi
  sleep 1
done

curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3037/ >/dev/null
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3027/api/v1/health/live >/dev/null
curl --fail --silent --show-error --max-time 15 https://portal.varietygroceries.com/api/v1/health/live >/dev/null
curl --fail --silent --show-error --max-time 15 https://portal.varietygroceries.com/ >/dev/null
curl --fail --silent --show-error --max-time 15 https://varietygroceries.com/ >/dev/null

trap - ERR INT TERM
rm -rf "$BACKUP_DIR"
printf 'variety-portal-live-api-rollout-ok release=%s\n' "$PORTAL_RELEASE_DIR"
