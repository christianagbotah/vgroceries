#!/usr/bin/env bash
# Read-only Variety Groceries release inventory. Never deletes, moves or restarts.
set -euo pipefail
ROOT="${VG_RELEASE_ROOT:-/home/lightworld/releases}"
WEBAPPS="${VG_WEBAPPS_ROOT:-/home/lightworld/webapps}"
case "$ROOT" in /*) ;; *) echo "Release root must be absolute" >&2; exit 2;; esac
printf 'Variety Groceries release audit (read-only)\n'
date -u '+UTC: %Y-%m-%dT%H:%M:%SZ'
df -h / || true
printf '\nService working directories:\n'
for service in varietygroceries-api varietygroceries-portal varietygroceries-portal-canonical vg-pos-staging-api vg-pos-staging-web varietygroceries-media-worker; do
  printf '%s: ' "$service"
  systemctl show "$service" -p WorkingDirectory --value 2>/dev/null || true
done
printf '\nActive service process directories (symlink-resolved, read-only):\n'
for service in varietygroceries-api varietygroceries-portal varietygroceries-portal-canonical vg-pos-staging-api vg-pos-staging-web varietygroceries-media-worker; do
  pid=$(systemctl show "$service" -p MainPID --value 2>/dev/null || true)
  if [[ "$pid" =~ ^[0-9]+$ ]] && (( pid > 1 )); then
    cwd=$(readlink -- "/proc/$pid/cwd" 2>/dev/null || true)
    printf '%s pid=%s cwd=%s\n' "$service" "$pid" "${cwd:-unavailable}"
  fi
done
printf '\nRelease inventory (NO automatic deletion recommendations):\n'
shopt -s nullglob
for path in "$ROOT"/varietygroceries-*; do
  [[ -d "$path" && ! -L "$path" ]] || continue
  name="${path##*/}"
  age=$(( ( $(date +%s) - $(stat -c %Y -- "$path") ) / 86400 ))
  size=$(du -sh -- "$path" 2>/dev/null | cut -f1 || true)
  printf '%-70s age=%3sd size=%s\n' "$name" "$age" "$size"
done
printf '\nDeployment symlinks:\n'
for link in "$WEBAPPS"/varietygroceries-api/current "$WEBAPPS"/varietygroceries-portal-current; do
  [[ -L "$link" ]] && printf '%s -> %s\n' "$link" "$(readlink -- "$link")"
done
printf '\nIMPORTANT: Directory age, symlink checks and service working directories are insufficient to authorize deletion.\n'
printf 'Also verify all process cwd/open files, unit drop-ins, Nginx, worktrees, unpushed changes, data, and verified rollback.\n'
df -h / || true
