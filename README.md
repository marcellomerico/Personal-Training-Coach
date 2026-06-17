# TrainingsKi – Persönliches KI-Coach-System für Sport & Gesundheit

Ein privates, multi-user-fähiges KI-Coach-System für Ausdauersport und Gesundheit.
Es importiert Trainings- und Gesundheitsdaten (primär **Garmin**, sekundär **Strava**),
analysiert Belastung und Erholung und gibt **nachvollziehbare** Trainings-, Recovery- und
Ernährungs-Empfehlungen – über einen **Telegram-Bot** (schnelle Interaktion) und eine
**Web-App** (Hauptplattform).

> Status: **Lokaler MVP mit Web-App, Telegram-Bot, Garmin-Stub-Sync,
> Readiness und Coach-Empfehlung ist nutzbar.**
> Der Garmin-Connector läuft standardmäßig im **Stub-Modus** und liefert
> deterministische Testdaten. Echter Garmin-Login und echte Garmin-Daten sind
> bewusst noch nicht produktiv aktiv, weil die aktuelle Garmin-Library-Anbindung
> mit echtem Account verifiziert werden muss.

## Dokumentation (Planung)

Die vollständige Planung liegt in [`/docs`](./docs):

- [`project-overview.md`](./docs/project-overview.md) – Produktverständnis, Zielbild, MVP, Entscheidungen
- [`requirements.md`](./docs/requirements.md) – funktionale & nicht-funktionale Anforderungen
- [`architecture.md`](./docs/architecture.md) – Architektur, Datenquellen, KI-Coach, Tech-Stack, Repo-Struktur
- [`data-model.md`](./docs/data-model.md) – konzeptionelles Datenmodell
- [`mvp-roadmap.md`](./docs/mvp-roadmap.md) – Phasen 0–7, MVP-Core & MVP-Extended
- [`open-questions.md`](./docs/open-questions.md) – Entscheidungen, Risiken, offene Fragen
- [`development-workflow.md`](./docs/development-workflow.md) – Branch-Regeln, Checks und Commit-Workflow

## Eckdaten

- **Datenquellen:** Garmin (primär, inoffizieller Connector), Strava (sekundär)
- **KI-Coach:** Regeln entscheiden; LLMs erklären optional, treffen aber keine Entscheidungen
- **LLM-Provider:** Anthropic/Claude oder Google Gemini, abschaltbar über `LLM_ENABLED`
- **Stack:** TypeScript-Monorepo (Web/Bot/API/Worker) + Python-Service für Garmin, PostgreSQL
- **Betrieb:** lokal/kostenloser Always-Free-Cloud-Tier, Zugriff via Tailscale

## Aktuell Nutzbar

- Web-App mit Registrierung, Login, Dashboard, Logout und Statusanzeige.
- Garmin-Stub-Auth mit MFA-Code `000000` und anschließender Stub-Synchronisation.
- Importierte Stub-Aktivitäten, Tagesgesundheit, Schlafdaten und Sync-Job-Historie.
- Automatische Readiness-Berechnung nach Sync inklusive 14-Tage-Historie.
- Regelbasierte Coach-Empfehlung im Dashboard und im Telegram-Bot.
- Telegram-Bot mit `/help`, `/today`, `/last` und `/sync`, sobald der Telegram-Account
  über die Web-App verknüpft wurde.
- Optionale LLM-Erklärung der Coach-Empfehlung via Anthropic oder Gemini.

## Noch Nicht Produktiv Nutzbar

- Echter Garmin-Login mit echten persönlichen Garmin-Daten. Die Architektur für
  verschlüsselte Provider-Secrets und zustandslose Session-Übergabe ist vorbereitet,
  aber die konkrete `garminconnect`-Anbindung muss mit echtem Account lokal
  implementiert und getestet werden.
- Strava-Integration, Workout-Writeback, Nutrition und Cycle Tracking sind noch
  geplante Erweiterungen.

## Lokales Setup (Entwicklung)

Voraussetzungen: Node 22 (`.nvmrc`), pnpm, PostgreSQL (lokal via Homebrew oder Docker),
Python 3.9+ für den Garmin-Connector.

```bash
# 1) Abhängigkeiten
pnpm install

# 2) Env anlegen und Werte setzen
cp .env.example .env   # mind. DATABASE_URL prüfen

# 3) Datenbank-Schema migrieren
pnpm --filter @ptc/db migrate

# 4) Backend-Services starten (API, Garmin-Connector, Worker)
pnpm dev:all

# 5) Web-App starten (separates Terminal)
pnpm dev:web

# Alternative: alles stoppen, Next-Cache leeren und Backend + Web neu starten
pnpm dev:restart
```

`pnpm dev:all` prüft Postgres, legt bei Bedarf die Python-venv für den
Garmin-Connector an, startet Garmin-Connector, API und Worker und startet den
Telegram-Bot nur, wenn `TELEGRAM_BOT_TOKEN` gesetzt ist. Bereits belegte Ports
werden nicht beendet, sondern übersprungen.

`pnpm dev:web` startet die Next.js-Web-App auf **http://localhost:3000**. Dort
registrieren/einloggen, Garmin-Auth-Stub starten, mit dem Stub-MFA-Code `000000`
verbinden und syncen. Das Dashboard zeigt Aktivität, Health, Schlaf, Readiness,
Coach-Empfehlung, Garmin-Status, Telegram-Status und Sync-Jobs.

`pnpm dev:restart` beendet lokale Dev-Prozesse auf den Ports für Web, API und
Garmin-Connector, leert `apps/web/.next` und startet Backend-Services plus Web
neu. Das ist der empfohlene Befehl nach Branch-Wechseln oder Next.js
Dev-Cache-Fehlern.

Einzelstarts bleiben möglich: `pnpm dev:api`, `pnpm dev:worker`,
`pnpm dev:bot`, `pnpm dev:web`.

Import-Flow (nach Login): `POST /providers/garmin/auth/start` →
`POST /providers/garmin/auth/complete` (Stub-MFA-Code `000000`) →
`POST /sync/garmin` → Daten lesen via `GET /activities`, `GET /daily-health`,
`GET /sleep`. Der alte Dev-Endpunkt `POST /providers/garmin/connect` bleibt als
Stub-Abkürzung vorhanden.

Jeder Garmin-Sync schreibt einen Eintrag in `sync_jobs` (`running`/`success`/
`failed`, Fehlertext, Statistik). Die letzten Jobs sind über
`GET /sync/garmin/jobs` sichtbar und werden im Dashboard angezeigt.

## Telegram-Bot

Der Telegram-Bot startet nur, wenn `TELEGRAM_BOT_TOKEN` gesetzt ist. Damit die
Bot-Befehle Daten liefern, muss der Telegram-Account einmal mit dem Web-Account
verknüpft werden:

1. Im Dashboard einen Telegram-Link erzeugen.
2. Den Link in Telegram öffnen.
3. Im Dashboard `Verknüpfung prüfen` klicken.
4. Danach im Bot `/today`, `/last` oder `/sync` verwenden.

Ohne Verknüpfung antwortet die API mit `Telegram-Nutzer ist nicht verknüpft`.

## Provider-Secrets

Tokens und Sessiondaten von externen Anbietern dürfen nicht im Klartext gespeichert
werden. Das Package `@ptc/config` stellt dafür `encryptSecret`,
`decryptSecret`, `encryptJsonSecret` und `decryptJsonSecret` bereit. Die
Funktionen nutzen `ENCRYPTION_KEY` und speichern Werte im versionierten
`ptc:v1`-Format, damit spätere Migrationen möglich bleiben.

Vor dem Abschließen des Garmin-Auth-Stubs und vor echter Garmin-/Strava-Anbindung
muss `ENCRYPTION_KEY` gesetzt sein:

```bash
openssl rand -base64 32
```

## Readiness / Coach-MVP (Phase 5)

Nach jedem Garmin-Sync berechnet das System automatisch eine **Tagesbewertung**
(Readiness) für die letzten 14 Tage bis zum jüngsten Datentag und speichert sie
(`readiness_metrics`).
Die Berechnung ist **deterministisch und regelbasiert** (Package `@ptc/analysis`,
kein LLM): schlechter Schlaf, HRV unter Baseline, erhöhter Ruhepuls und eine harte
Einheit am Vortag senken den Score (0–100). Daraus folgt eine Entscheidung
(`rest`/`easy`/`normal`/`hard`) plus eine strukturierte, nachvollziehbare
`rationale` (Inputs + Regel-Beiträge).

API (user-scoped, SessionGuard): `GET /readiness/latest`,
`GET /readiness/history`, `POST /analysis/readiness/recompute`. Dashboard zeigt
den neuesten Wert und eine kleine Historie; Telegram-`/today` zeigt die neueste
Bewertung an, falls vorhanden.

Die Coach-Empfehlung baut auf der neuesten Readiness auf und bleibt ebenfalls
regelbasiert. API: `GET /coach/recommendation`. Dashboard und Telegram-`/today`
zeigen die Empfehlung an.

> **Kein medizinischer Rat.** Das ist eine grobe v0-Heuristik zur Orientierung;
> Schwellwerte und Baselines werden später verfeinert.

## LLM-Erklärungsschicht

LLMs sind optional und ändern keine Entscheidung. Sie erzeugen nur einen kurzen
Klartext für `explanationText`, wenn `LLM_ENABLED=true` gesetzt ist.

```bash
# Anthropic / Claude
LLM_ENABLED=true
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
LLM_MODEL=claude-opus-4-8

# oder Google Gemini
LLM_ENABLED=true
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
```

Hinweis: Bei aktivem Cloud-LLM verlassen die in der Empfehlung enthaltenen
Gesundheitswerte das lokale System und werden an den gewählten Anbieter gesendet.

## Qualitätschecks

```bash
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test
```

Aktuell testet `pnpm run test` die deterministische Readiness-/Coach-Logik im
Package `@ptc/analysis` und die Provider-Secret-Verschlüsselung in `@ptc/config`.

## Hinweise

- Sensible Daten (Gesundheitsdaten, Tokens) werden verschlüsselt behandelt; niemals Secrets committen.
- Der inoffizielle Garmin-Connector ist nur für eigene Accounts gedacht (siehe `docs/open-questions.md`).
- Echte Garmin-Daten sind der nächste große technische Integrationsschritt.
