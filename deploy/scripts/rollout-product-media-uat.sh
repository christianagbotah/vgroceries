#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/home/lightworld/webapps/varietygroceries-api/current}"
SHARED_ROOT="${SHARED_ROOT:-/home/lightworld/data/varietygroceries}"
PORTAL_BASE_URL="${PORTAL_BASE_URL:-https://portal.varietygroceries.com}"
PUBLIC_COMING_SOON_URL="${PUBLIC_COMING_SOON_URL:-https://varietygroceries.com/}"
API_ENV_FILE="${API_ENV_FILE:-/home/lightworld/config/varietygroceries/api.env}"
NGINX_SNIPPET_TARGET="${NGINX_SNIPPET_TARGET:-}"
SERVICE_NAME="${SERVICE_NAME:-varietygroceries-media-worker.service}"
SYSTEMD_UNIT_TARGET="${SYSTEMD_UNIT_TARGET:-/etc/systemd/system/$SERVICE_NAME}"
MEDIA_ROOT="$SHARED_ROOT/product-media"
LEGACY_PUBLIC_ROOT="${LEGACY_PRODUCT_MEDIA_ROOT:-$APP_ROOT/public}"
SOURCE_SYSTEMD_UNIT="$APP_ROOT/deploy/systemd/varietygroceries-media-worker.service"
SOURCE_NGINX_SNIPPET="$APP_ROOT/deploy/nginx/varietygroceries-product-media.conf"
API_DIR="$APP_ROOT/apps/api"
PUBLIC_COMING_SOON_ROOT="/home/lightworld/webapps/varietygroceries"

fail() {
  printf 'Product Media UAT rollout failed: %s\n' "$*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "required file is missing: $1"
}

read_env_value() {
  local key="$1"
  local value
  value="$(grep -E "^[[:space:]]*${key}=" "$API_ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "run this rollout as root (or through sudo)"
[[ -n "$NGINX_SNIPPET_TARGET" ]] || fail "NGINX_SNIPPET_TARGET must point to an include file inside the portal HTTPS server configuration"
[[ "$APP_ROOT" != "$PUBLIC_COMING_SOON_ROOT" && "$APP_ROOT" != "$PUBLIC_COMING_SOON_ROOT/"* ]] || \
  fail "APP_ROOT must never point at the public Coming Soon site"

require_file "$API_DIR/package.json"
require_file "$API_ENV_FILE"
require_file "$SOURCE_SYSTEMD_UNIT"
require_file "$SOURCE_NGINX_SNIPPET"
[[ -d "$(dirname "$NGINX_SNIPPET_TARGET")" ]] || fail "Nginx include directory does not exist: $(dirname "$NGINX_SNIPPET_TARGET")"

storage_kind="$(read_env_value PRODUCT_MEDIA_STORAGE)"
filesystem_root="$(read_env_value PRODUCT_MEDIA_FILESYSTEM_ROOT)"
public_base_url="$(read_env_value PRODUCT_MEDIA_PUBLIC_BASE_URL)"
ai_provider="$(read_env_value AI_IMAGE_PROVIDER)"
openai_key="$(read_env_value OPENAI_API_KEY)"

[[ "$storage_kind" == "filesystem" ]] || fail "UAT rollout requires PRODUCT_MEDIA_STORAGE=filesystem"
[[ "$filesystem_root" == "$MEDIA_ROOT" ]] || fail "PRODUCT_MEDIA_FILESYSTEM_ROOT must be $MEDIA_ROOT"
[[ "$public_base_url" == "$PORTAL_BASE_URL/media/products/" ]] || fail "PRODUCT_MEDIA_PUBLIC_BASE_URL must be $PORTAL_BASE_URL/media/products/"
case "$ai_provider" in
  fake)
    ;;
  openai)
    [[ -n "$openai_key" ]] || fail "OPENAI_API_KEY is required when AI_IMAGE_PROVIDER=openai"
    ;;
  *)
    fail "AI_IMAGE_PROVIDER must be fake or openai for UAT"
    ;;
esac
unset openai_key

install -d -o lightworld -g lightworld -m 0750 "$SHARED_ROOT/product-media/private"
install -d -o lightworld -g lightworld -m 0755 "$SHARED_ROOT/product-media/public"

printf 'Building API/worker from %s...\n' "$APP_ROOT"
npm run --prefix "$API_DIR" build

printf 'Applying forward-only database migrations...\n'
npm run --prefix "$API_DIR" migrate:deploy

printf 'Planning legacy media import (read-only dry-run)...\n'
LEGACY_PRODUCT_MEDIA_ROOT="$LEGACY_PUBLIC_ROOT" \
  npm run --prefix "$API_DIR" media:import-legacy -- --dry-run

printf 'Running idempotent legacy media import...\n'
LEGACY_PRODUCT_MEDIA_ROOT="$LEGACY_PUBLIC_ROOT" \
  npm run --prefix "$API_DIR" media:import-legacy

tmp_dir="$(mktemp -d)"
probe_name=".variety-media-rollout-probe-$(date +%s)-$$.txt"
probe_path="$SHARED_ROOT/product-media/public/$probe_name"
had_nginx_target=0
had_systemd_target=0
worker_was_active=0
runtime_files_changed=0

if [[ -f "$NGINX_SNIPPET_TARGET" ]]; then
  cp -a "$NGINX_SNIPPET_TARGET" "$tmp_dir/nginx.previous"
  had_nginx_target=1
fi
if [[ -f "$SYSTEMD_UNIT_TARGET" ]]; then
  cp -a "$SYSTEMD_UNIT_TARGET" "$tmp_dir/systemd.previous"
  had_systemd_target=1
fi
if systemctl is-active --quiet "$SERVICE_NAME"; then
  worker_was_active=1
fi

restore_runtime_files() {
  set +e
  rm -f "$probe_path"

  if [[ "$had_nginx_target" -eq 1 ]]; then
    cp -a "$tmp_dir/nginx.previous" "$NGINX_SNIPPET_TARGET"
  else
    rm -f "$NGINX_SNIPPET_TARGET"
  fi

  if [[ "$had_systemd_target" -eq 1 ]]; then
    cp -a "$tmp_dir/systemd.previous" "$SYSTEMD_UNIT_TARGET"
  else
    rm -f "$SYSTEMD_UNIT_TARGET"
  fi

  systemctl daemon-reload >/dev/null 2>&1
  if [[ "$worker_was_active" -eq 1 ]]; then
    systemctl restart "$SERVICE_NAME" >/dev/null 2>&1
  else
    systemctl stop "$SERVICE_NAME" >/dev/null 2>&1
  fi

  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1
  fi
  set -e
}

on_exit() {
  local status=$?
  if [[ "$status" -ne 0 && "$runtime_files_changed" -eq 1 ]]; then
    printf 'Runtime verification failed; restoring previous systemd/Nginx files...\n' >&2
    restore_runtime_files
  fi
  rm -f "$probe_path"
  rm -rf "$tmp_dir"
  exit "$status"
}
trap on_exit EXIT

install -o root -g root -m 0644 "$SOURCE_SYSTEMD_UNIT" "$SYSTEMD_UNIT_TARGET"
install -o root -g root -m 0644 "$SOURCE_NGINX_SNIPPET" "$NGINX_SNIPPET_TARGET"
runtime_files_changed=1

printf 'Validating Nginx before any reload...\n'
nginx -t

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl is-active --quiet "$SERVICE_NAME" || fail "$SERVICE_NAME is not active"

systemctl reload nginx

printf 'variety-media-rollout-ok\n' > "$probe_path"
chown lightworld:lightworld "$probe_path"
chmod 0644 "$probe_path"

public_code="$(curl -sS -o /dev/null -w '%{http_code}' "$PORTAL_BASE_URL/media/products/$probe_name")"
[[ "$public_code" == "200" ]] || fail "public media probe returned HTTP $public_code instead of 200"

private_code="$(curl -sS -o /dev/null -w '%{http_code}' "$PORTAL_BASE_URL/media/private/$probe_name")"
[[ "$private_code" == "404" ]] || fail "private media probe returned HTTP $private_code instead of 404"

coming_soon_code="$(curl -sS -o /dev/null -w '%{http_code}' "$PUBLIC_COMING_SOON_URL")"
[[ "$coming_soon_code" == "200" ]] || fail "public Coming Soon site returned HTTP $coming_soon_code instead of 200"

rm -f "$probe_path"
runtime_files_changed=0

printf 'Product Media UAT rollout verified successfully. Provider=%s, portal=%s\n' "$ai_provider" "$PORTAL_BASE_URL"
