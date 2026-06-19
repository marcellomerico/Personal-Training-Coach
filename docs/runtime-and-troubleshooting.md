# Runtime & Troubleshooting

Kurzanleitung für den **lokalen Betrieb** und typische Fehlerbilder. Für den
funktionalen End-to-End-Test siehe [`e2e-functional-checklist.md`](./e2e-functional-checklist.md).

## Services und Ports

| Service | Port (Default) | Health |
|---------|----------------|--------|
| Web-App (`apps/web`) | 3000 | – (Next.js) |
| API (`apps/api`) | 3001 | `GET /health`, `GET /health/ready` |
| Garmin-Connector (Python) | 8000 | `GET /health` |
| Worker (`apps/worker`) | – (pg-boss, kein HTTP) | Logs |
| Telegram-Bot (`apps/bot`) | – (Long-Polling) | Logs |
| PostgreSQL | 5432 | `psql` / `pg_isready` |

## Start / Stop / Neustart

```bash
# Backend: API + Connector + Worker (+ Bot wenn Token gesetzt)
pnpm dev:all

# Web separat
pnpm dev:web

# Alles hart neu starten (empfohlen nach Branch-Wechsel / Next-Fehler)
pnpm dev:restart
```

`dev:all` beendet **keine** bereits laufenden Prozesse auf den Ports – es
überspringt sie. Wenn etwas „hängt“, zuerst `pnpm dev:restart` oder die Ports
manuell freigeben.

## Schnell-Check: Laufen alle Services?

```bash
pnpm ops:health
```

Prüft nacheinander:

1. `GET /health` (API Liveness)
2. `GET /health/ready` (DB + Garmin-Connector)
3. `GET /health` (Garmin-Connector)
4. `GET /health/ops` (Sync-Job-Statistik 24h, intern geschützt)

Bei gesetztem `INTERNAL_API_KEY` wird der Ops-Endpunkt mit `x-internal-key`
aufgerufen.

## Wichtige Umgebungsvariablen

| Variable | Zweck |
|----------|-------|
| `DATABASE_URL` | PostgreSQL-Verbindung (Pflicht) |
| `SESSION_SECRET` | Web-Sessions (Pflicht für Login) |
| `ENCRYPTION_KEY` | Verschlüsselung von Provider-Secrets (Pflicht vor Garmin-Auth) |
| `GARMIN_CONNECTOR_URL` | URL des Python-Connectors |
| `GARMIN_STUB_MODE` | `true` (Default) = Stub-Daten; `false` = echter Garmin-Pfad |
| `GARMIN_EMAIL` / `GARMIN_PASSWORD` | Nur für Real-Modus im Connector |
| `INTERNAL_API_KEY` | Bot → API, Ops-Endpunkt (optional lokal) |
| `TELEGRAM_BOT_TOKEN` | Bot startet nur wenn gesetzt |
| `LOG_LEVEL` | `info` (Default), `debug` für mehr Logs |

## Garmin: Stub vs. Real

**Stub (empfohlen für tägliche Entwicklung)**

- Connector: `GARMIN_STUB_MODE=true` (Default in `dev-all.sh`)
- Web-Auth: MFA-Code `000000`
- Keine echten Garmin-Credentials nötig

**Real (nur mit eigenem Account testen)**

Server/Connector einmal auf Real-Modus stellen (`.env` oder Shell):

```bash
GARMIN_STUB_MODE=false
```

Zugangsdaten dann **im Web-Dashboard** eingeben (E-Mail + Passwort + MFA) — nicht
mehr zwingend `GARMIN_EMAIL`/`GARMIN_PASSWORD` in der Umgebung. Env-Variablen
bleiben als optionaler Fallback für lokale Admin-Setups.

```bash
pnpm dev:restart
```

Nach erfolgreichem Login ist `authMode` in der DB `unofficial_real`. Sync
benötigt eine gültige, verschlüsselte Session in `provider_accounts.secrets`.

**Mismatch vermeiden:** Real-Account in der DB + Stub-Connector (oder umgekehrt)
führt zu verwirrenden Fehlern. Connector-Modus und Auth-Flow müssen zusammenpassen.

## Typische Fehler

### Postgres nicht erreichbar

**Symptom:** `dev:all` bricht ab oder `/health/ready` meldet `database: ok=false`.

**Lösung:**

```bash
brew services start postgresql@16   # Homebrew
# oder Docker-Compose-Postgres starten
psql "$DATABASE_URL" -c "select 1;"
```

### `ENCRYPTION_KEY muss gesetzt sein`

**Symptom:** Garmin-Auth schlägt beim Speichern der Secrets fehl.

**Lösung:** In `.env` setzen (`openssl rand -base64 32`). Key danach **nicht**
mehr ändern, sonst sind bestehende Secrets nicht mehr entschlüsselbar.

### `Telegram-Nutzer ist nicht verknüpft`

**Symptom:** Bot-Befehle `/today`, `/sync` schlagen fehl.

**Lösung:** Im Dashboard Telegram-Link erzeugen → in Telegram öffnen →
„Verknüpfung prüfen“. Siehe auch README-Abschnitt Telegram.

### Garmin-Sync `failed`: Session fehlt / abgelaufen

**Symptom:** Sync-Job mit Fehler wie „Garmin-Session fehlt oder ist ungültig“
oder HTTP 401 vom Connector.

**Ursache:** Real-Account ohne gültige Session (abgelaufen, `ENCRYPTION_KEY`
gewechselt, Secrets leer).

**Lösung:** Garmin im Dashboard erneut verbinden (Auth-Flow komplett), dann
erneut syncen.

### Garmin-Connector nicht erreichbar

**Symptom:** `/health/ready` → `garminConnector: ok=false`.

**Lösung:**

- Läuft `pnpm dev:all`?
- Port 8000 frei? `lsof -nP -iTCP:8000 -sTCP:LISTEN`
- Python-venv: `services/garmin-connector/.venv` mit `pip install -r requirements.txt`

### Sync liefert Stub-Daten trotz Real-Account

**Ursache:** `GARMIN_STUB_MODE=true` im Connector, aber DB-Account ist `unofficial_real`.

**Lösung:** `GARMIN_STUB_MODE=false` setzen und Connector neu starten.

### Next.js zeigt alte/fehlerhafte Seiten

**Symptom:** 404, Hydration-Fehler, Dashboard lädt nicht nach Branch-Wechsel.

**Lösung:** `pnpm dev:restart` (löscht `apps/web/.next` und startet neu).

### Bot startet nicht

**Symptom:** `TELEGRAM_BOT_TOKEN is empty; skipping Telegram bot` in `dev:all`.

**Lösung:** Token und `TELEGRAM_BOT_USERNAME` in `.env` setzen, `dev:all` neu starten.

### Worker verarbeitet Enqueue-Jobs nicht

**Symptom:** Sync-Jobs bleiben auf `queued`.

**Prüfen:**

- Läuft der Worker? (`pnpm dev:all` startet ihn mit)
- Worker-Logs: `garmin-sync Job verarbeitet` oder Fehler
- Postgres-Queue (pg-boss) nutzt dieselbe `DATABASE_URL` wie API

## Logs

Alle TS-Services nutzen strukturierte Logs (pino) über `createLogger` aus
`@ptc/config`. Sensible Felder werden redigiert.

```bash
LOG_LEVEL=debug pnpm dev:all
```

| Logger-Name | Service |
|-------------|---------|
| `api` | NestJS-API |
| `worker` | pg-boss Worker |
| `bot` | Telegram-Bot |

Der Garmin-Connector loggt über Python `logging` (Warnungen bei Auth-/Fetch-Fehlern,
ohne Credentials).

## Nützliche API-Endpunkte (Debug)

```bash
# Nach Login Session-Cookie aus Browser übernehmen
COOKIE="ptc_session=..."

curl -s -b "$COOKIE" http://localhost:3001/providers/garmin/status | jq
curl -s -b "$COOKIE" http://localhost:3001/sync/garmin/jobs | jq
curl -s http://localhost:3001/health/ready | jq
curl -s http://localhost:8000/health | jq
```

## Wenn nichts hilft

1. `pnpm dev:restart`
2. `pnpm ops:health`
3. Checkliste A+B in [`e2e-functional-checklist.md`](./e2e-functional-checklist.md)
4. `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run test`
