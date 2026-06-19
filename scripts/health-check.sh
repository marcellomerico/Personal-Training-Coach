#!/usr/bin/env bash
# Prüft Liveness/Readiness der lokalen Dev-Services.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

API_BASE="${API_BASE_URL:-http://localhost:${API_PORT:-3001}}"
GARMIN_BASE="${GARMIN_CONNECTOR_URL:-http://localhost:${GARMIN_CONNECTOR_PORT:-8000}}"

log() {
  printf '[health-check] %s\n' "$*"
}

check_json() {
  local name="$1"
  local url="$2"
  local extra_headers="${3:-}"

  log "GET $url"
  if [ -n "$extra_headers" ]; then
    curl -fsS -H "$extra_headers" "$url"
  else
    curl -fsS "$url"
  fi | python3 -m json.tool
  printf '\n'
}

log "API liveness"
check_json "api" "$API_BASE/health"

log "API readiness"
check_json "api-ready" "$API_BASE/health/ready"

log "Garmin connector"
check_json "garmin" "$GARMIN_BASE/health"

if [ -n "${INTERNAL_API_KEY:-}" ]; then
  log "API ops snapshot"
  check_json "api-ops" "$API_BASE/health/ops" "x-internal-key: $INTERNAL_API_KEY"
else
  log "INTERNAL_API_KEY leer – /health/ops übersprungen (lokale Dev erlaubt Zugriff ohne Key)"
  check_json "api-ops" "$API_BASE/health/ops"
fi

log "Alle Checks erfolgreich."
