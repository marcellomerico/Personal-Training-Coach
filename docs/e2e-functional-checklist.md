# E2E-Funktions-Checkliste (lokal)

Manuelle Checkliste, um den **funktionalen MVP-Pfad** lokal zu verifizieren, bevor UI-Polish
oder echte Garmin-Accounts im Produktivbetrieb genutzt werden.

**Ziel:** Nach jedem grösseren Garmin-/Sync-/Coach-Change einmal durchlaufen und
Ergebnis + Datum notieren.

## Voraussetzungen

- Node 22, pnpm, PostgreSQL laufend
- `.env` aus `.env.example` (mind. `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`)
- Schema migriert: `pnpm --filter @ptc/db migrate`
- Services: `pnpm dev:all` (API :3001, Connector :8000, Worker) + `pnpm dev:web` (:3000)

### Stub-Modus (Standard, empfohlen für tägliche Checks)

```bash
# Connector startet mit GARMIN_STUB_MODE=true (Default in dev-all.sh)
pnpm dev:all
pnpm dev:web
```

### Real-Modus (nur mit echtem Garmin-Account testen)

```bash
export GARMIN_STUB_MODE=false
export GARMIN_EMAIL="..."
export GARMIN_PASSWORD="..."
# ENCRYPTION_KEY muss gesetzt sein (Secrets werden verschlüsselt gespeichert)
pnpm dev:restart
```

Connector und Account-`authMode` müssen zusammenpassen:

| Connector | Auth-Flow | `authMode` in DB | Session nötig |
|-----------|-----------|------------------|---------------|
| Stub (`GARMIN_STUB_MODE=true`) | Stub-MFA `000000` | `unofficial_stub` oder `unofficial` | nein |
| Real (`GARMIN_STUB_MODE=false`) | Echter Login + MFA | `unofficial_real` | ja |

## Checkliste A – Basis (Stub)

| # | Schritt | Erwartung | OK |
|---|---------|-----------|-----|
| A1 | `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run test` | alle grün | ☐ |
| A2 | Web öffnen http://localhost:3000, Registrierung + Login | Dashboard sichtbar, Session-Cookie gesetzt | ☐ |
| A3 | Garmin verbinden (Auth start → MFA `000000` → complete) | Status „verbunden“, `authMode` stub/unofficial | ☐ |
| A4 | Sync auslösen (Dashboard oder `POST /sync/garmin`) | `sync_jobs`: `success`, Stats > 0 | ☐ |
| A5 | Dashboard: Aktivitäten, Health, Schlaf | Einträge nach Sync sichtbar | ☐ |
| A6 | Readiness im Dashboard | Score + Historie (nach erstem Sync) | ☐ |
| A7 | Coach-Empfehlung im Dashboard | Regelbasierte Empfehlung (ohne LLM ok) | ☐ |
| A8 | Logout + erneuter Login | Daten und Garmin-Status bleiben | ☐ |

## Checkliste B – Telegram

| # | Schritt | Erwartung | OK |
|---|---------|-----------|-----|
| B1 | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` in `.env` | Bot startet mit `dev:all` | ☐ |
| B2 | Dashboard: Telegram-Link erzeugen → in Telegram öffnen → „Verknüpfung prüfen“ | `telegramUserId` gesetzt | ☐ |
| B3 | Bot: `/help` | Hilfetext | ☐ |
| B4 | Bot: `/today` | Readiness + Coach (Stub-Daten) | ☐ |
| B5 | Bot: `/last` | Letzte Aktivität | ☐ |
| B6 | Bot: `/sync` | Sync läuft, Antwort ohne Fehler | ☐ |
| B7 | Bot ohne Verknüpfung (anderer Telegram-User) | „Telegram-Nutzer ist nicht verknüpft“ | ☐ |

## Checkliste C – Async-Sync (Worker)

| # | Schritt | Erwartung | OK |
|---|---------|-----------|-----|
| C1 | `POST /sync/garmin/enqueue` (eingeloggt) | sofort `queued`, dann Worker → `success` | ☐ |
| C2 | Worker-Log | `garmin-sync Job verarbeitet` mit Stats | ☐ |
| C3 | `GET /sync/garmin/jobs` | letzte Jobs im Dashboard konsistent | ☐ |

## Checkliste D – Real-Garmin (optional)

Nur wenn `GARMIN_STUB_MODE=false` und gültige `GARMIN_EMAIL`/`GARMIN_PASSWORD`.

| # | Schritt | Erwartung | OK |
|---|---------|-----------|-----|
| D1 | Auth start + MFA (echter Code) | `authMode`: `unofficial_real`, Secrets gespeichert | ☐ |
| D2 | Sync | `success`, echte Aktivitäten/Health/Sleep (nicht Stub-IDs) | ☐ |
| D3 | Connector neu starten, erneut sync | Session aus DB/Secrets funktioniert (kein Re-Login) | ☐ |
| D4 | Abgelaufene Session simulieren (Secrets leeren oder Token ungültig) | Sync `failed`, klare Fehlermeldung, Re-Auth-Hinweis | ☐ |

## Checkliste E – LLM (optional)

| # | Schritt | Erwartung | OK |
|---|---------|-----------|-----|
| E1 | `LLM_ENABLED=false` | Coach ohne `explanationText` oder Fallback-Text | ☐ |
| E2 | `LLM_ENABLED=true` + Provider-Key (Anthropic oder Gemini) | Zusätzliche Erklärung zur Empfehlung | ☐ |

## API-Schnelltests (curl)

Session-Cookie nach Login aus Browser übernehmen oder Login-Response nutzen.

```bash
# Garmin-Status
curl -s -b "$COOKIE" http://localhost:3001/providers/garmin/status | jq

# Sync
curl -s -X POST -b "$COOKIE" http://localhost:3001/sync/garmin | jq

# Sync-Jobs
curl -s -b "$COOKIE" http://localhost:3001/sync/garmin/jobs | jq

# Readiness
curl -s -b "$COOKIE" http://localhost:3001/readiness/today | jq

# Coach
curl -s -b "$COOKIE" http://localhost:3001/coach/recommendation | jq
```

## Bekannte Grenzen (Stand MVP)

- MFA-Challenges im Connector nur im Prozess-Speicher (mehrere Uvicorn-Worker → Auth instabil).
- Echter Garmin-Pfad ohne persönlichen Test-Account noch nicht CI-abgedeckt.
- Strava, Workout-Writeback, Nutrition: nicht im Scope dieser Checkliste.
- UI/Dashboard-Polish bewusst später (separater Schritt).

## Ergebnisprotokoll

| Datum | Branch/Commit | Modus (Stub/Real) | A | B | C | D | E | Notizen |
|-------|---------------|-------------------|---|---|---|---|---|---------|
|       |               |                   |   |   |   |   |   |         |
