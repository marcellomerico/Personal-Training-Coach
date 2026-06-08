#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GARMIN_DIR="$ROOT_DIR/services/garmin-connector"

PIDS=()

log() {
  printf '\n[%s] %s\n' "dev-all" "$*"
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

  log "Stopping dev services..."
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

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

start_service() {
  local name="$1"
  shift

  log "Starting $name..."
  (
    exec "$@"
  ) &
  PIDS+=("$!")
}

cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
else
  echo "Missing .env. Create it first: cp .env.example .env" >&2
  exit 1
fi

require_command pnpm
require_command python3
require_command lsof

if [ -d "/opt/homebrew/opt/postgresql@16/bin" ]; then
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  log "Installing pnpm dependencies..."
  pnpm install
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is missing in .env." >&2
  exit 1
fi

PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"

if command -v psql >/dev/null 2>&1; then
  if ! psql "$PSQL_DATABASE_URL" -c "select 1;" >/dev/null 2>&1; then
    echo "Postgres is not reachable via DATABASE_URL." >&2
    echo "If you use Homebrew Postgres, start it with:" >&2
    echo "  brew services start postgresql@16" >&2
    exit 1
  fi
elif command -v pg_isready >/dev/null 2>&1; then
  if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "Postgres is not reachable on localhost:5432." >&2
    echo "If you use Homebrew Postgres, start it with:" >&2
    echo "  brew services start postgresql@16" >&2
    exit 1
  fi
else
  log "psql/pg_isready not found; skipping Postgres readiness check."
fi

if [ ! -x "$GARMIN_DIR/.venv/bin/python" ]; then
  log "Creating Garmin connector virtualenv..."
  python3 -m venv "$GARMIN_DIR/.venv"
fi

if ! "$GARMIN_DIR/.venv/bin/python" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  log "Installing Garmin connector Python dependencies..."
  "$GARMIN_DIR/.venv/bin/pip" install -r "$GARMIN_DIR/requirements.txt"
fi

if port_in_use "${GARMIN_CONNECTOR_PORT:-8000}"; then
  log "Garmin connector port ${GARMIN_CONNECTOR_PORT:-8000} already in use; leaving it running."
else
  start_service "garmin" bash -lc \
    "cd '$GARMIN_DIR' && GARMIN_STUB_MODE='${GARMIN_STUB_MODE:-true}' exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port '${GARMIN_CONNECTOR_PORT:-8000}'"
fi

if port_in_use "${API_PORT:-3001}"; then
  log "API port ${API_PORT:-3001} already in use; leaving it running."
else
  start_service "api" pnpm --filter @ptc/api dev
fi

start_service "worker" pnpm --filter @ptc/worker dev

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  start_service "bot" pnpm --filter @ptc/bot dev
else
  log "TELEGRAM_BOT_TOKEN is empty; skipping Telegram bot."
fi

log "Dev services are running. Press Ctrl+C to stop services started by this script."
wait
