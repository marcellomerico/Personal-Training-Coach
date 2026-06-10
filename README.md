# TrainingsKi – Persönliches KI-Coach-System für Sport & Gesundheit

Ein privates, multi-user-fähiges KI-Coach-System für Ausdauersport und Gesundheit.
Es importiert Trainings- und Gesundheitsdaten (primär **Garmin**, sekundär **Strava**),
analysiert Belastung und Erholung und gibt **nachvollziehbare** Trainings-, Recovery- und
Ernährungs-Empfehlungen – über einen **Telegram-Bot** (schnelle Interaktion) und eine
**Web-App** (Hauptplattform).

> Status: **Phase 1 (Auth & Multi-User) und Phase 2 (Garmin-Import, Stub) implementiert.**
> Der Garmin-Connector läuft aktuell im **Stub-Modus** (deterministische Testdaten) –
> der echte Login (garth/garminconnect, inkl. MFA) wird ergänzt, ohne das Interface zu ändern.

## Dokumentation (Planung)

Die vollständige Planung liegt in [`/docs`](./docs):

- [`project-overview.md`](./docs/project-overview.md) – Produktverständnis, Zielbild, MVP, Entscheidungen
- [`requirements.md`](./docs/requirements.md) – funktionale & nicht-funktionale Anforderungen
- [`architecture.md`](./docs/architecture.md) – Architektur, Datenquellen, KI-Coach, Tech-Stack, Repo-Struktur
- [`data-model.md`](./docs/data-model.md) – konzeptionelles Datenmodell
- [`mvp-roadmap.md`](./docs/mvp-roadmap.md) – Phasen 0–7, MVP-Core & MVP-Extended
- [`open-questions.md`](./docs/open-questions.md) – Entscheidungen, Risiken, offene Fragen
- [`development-workflow.md`](./docs/development-workflow.md) – Branch-Regeln, Checks und Commit-Workflow

## Eckdaten (Stand Planung)

- **Datenquellen:** Garmin (primär, inoffizieller Connector), Strava (sekundär)
- **KI-Coach:** Regeln entscheiden, Analyse rechnet (CTL/ATL/TSB, Readiness), **Claude** erklärt
- **Stack (geplant):** TypeScript-Monorepo (Web/Bot/API/Worker) + Python-Service für Garmin, PostgreSQL
- **Betrieb:** lokal/kostenloser Always-Free-Cloud-Tier, Zugriff via Tailscale

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

`pnpm dev:web` startet die Next.js-Web-App (Phase 4 MVP) auf
**http://localhost:3000** – dort registrieren/einloggen, Garmin-Auth-Stub
starten, mit dem Stub-MFA-Code `000000` verbinden und syncen, Dashboard mit
letzter Aktivität, Health- und Schlafdaten.

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

> ⚠️ **Kein medizinischer Rat.** Das ist eine grobe v0-Heuristik zur Orientierung;
> Schwellwerte und Baselines werden später verfeinert.

## Qualitätschecks

```bash
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test
```

Aktuell testet `pnpm run test` die deterministische Readiness-Engine im Package
`@ptc/analysis` und die Provider-Secret-Verschlüsselung in `@ptc/config`.

## Hinweise

- Sensible Daten (Gesundheitsdaten, Tokens) werden verschlüsselt behandelt; niemals Secrets committen.
- Der inoffizielle Garmin-Connector ist nur für eigene Accounts gedacht (siehe `docs/open-questions.md`).
