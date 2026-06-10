#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${WEB_PORT:-3000}"
PIDS=()

log() {
  printf '\n[%s] %s\n' "dev-restart" "$*"
}

kill_tree() {
  local pid="$1"
  local child

  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done

  kill "$pid" >/dev/null 2>&1 || true
}

cleanup() {
  if [ "${#PIDS[@]}" -eq 0 ]; then
    return
  fi

  log "Stopping restarted dev services..."
  for pid in "${PIDS[@]}"; do
    kill_tree "$pid"
  done
  wait >/dev/null 2>&1 || true
}

trap cleanup INT TERM EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_env() {
  if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
    set +a
  fi
}

stop_port() {
  local name="$1"
  local port="$2"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return
  fi

  log "Stopping $name on port $port..."
  for pid in $pids; do
    kill_tree "$pid"
  done
}

# Stoppt lokale Dev-Prozesse DIESES Repos. Lokale Dev-Aktion: trifft nur
# Prozesse, die sowohl ein Dev-Pattern matchen ALS AUCH dieses Repo
# referenzieren (Pfad unter ROOT_DIR oder ein @ptc/-Scope) – damit keine
# fremden pnpm/turbo-Prozesse anderer Projekte beendet werden.
stop_matching_project_processes() {
  local pid command
  local patterns=(
    "scripts/dev-all.sh"
    "pnpm dev:all"
    "pnpm dev:web"
    "turbo run dev --filter=@ptc/api"
    "turbo run dev --filter=@ptc/web"
    "turbo run dev --filter=@ptc/worker"
    "turbo run dev --filter=@ptc/bot"
    "pnpm --filter @ptc/api dev"
    "pnpm --filter @ptc/worker dev"
    "pnpm --filter @ptc/bot dev"
    "apps/worker/src/index.ts"
    "apps/bot/src/index.ts"
  )

  while read -r pid command; do
    [ -n "${pid:-}" ] || continue
    [ "$pid" != "$$" ] || continue
    # Repo-Scope: Prozess muss dieses Repo referenzieren.
    [[ "$command" == *"$ROOT_DIR"* || "$command" == *"@ptc/"* ]] || continue

    for pattern in "${patterns[@]}"; do
      if [[ "$command" == *"$pattern"* ]]; then
        log "Stopping old dev process $pid ($pattern)..."
        kill_tree "$pid"
        break
      fi
    done
  done < <(ps ax -o pid= -o command=)
}

start_service() {
  local name="$1"
  shift

  log "Starting $name..."
  (
    cd "$ROOT_DIR"
    exec "$@"
  ) &
  PIDS+=("$!")
}

cd "$ROOT_DIR"
load_env

require_command pnpm
require_command lsof
require_command pgrep

log "Stopping existing local dev services..."
stop_matching_project_processes
sleep 1
# Lokale Dev-Aktion: belegt etwas die lokalen Dev-Ports (Web/API/Connector),
# wird es beendet. Nur für die lokale Entwicklung gedacht.
stop_port "web" "$WEB_PORT"
stop_port "api" "${API_PORT:-3001}"
stop_port "garmin connector" "${GARMIN_CONNECTOR_PORT:-8000}"

log "Clearing Next.js dev cache..."
rm -rf "$ROOT_DIR/apps/web/.next"

start_service "backend services" pnpm dev:all
start_service "web app" pnpm dev:web

log "Restart complete. Web: http://localhost:$WEB_PORT"
log "Press Ctrl+C here to stop services started by this restart script."
wait
