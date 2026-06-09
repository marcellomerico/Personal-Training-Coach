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
```

`pnpm dev:all` prüft Postgres, legt bei Bedarf die Python-venv für den
Garmin-Connector an, startet Garmin-Connector, API und Worker und startet den
Telegram-Bot nur, wenn `TELEGRAM_BOT_TOKEN` gesetzt ist. Bereits belegte Ports
werden nicht beendet, sondern übersprungen.

`pnpm dev:web` startet die Next.js-Web-App (Phase 4 MVP) auf
**http://localhost:3000** – dort registrieren/einloggen, Garmin (Stub)
verbinden und syncen, Dashboard mit letzter Aktivität, Health- und Schlafdaten.

Einzelstarts bleiben möglich: `pnpm dev:api`, `pnpm dev:worker`,
`pnpm dev:bot`, `pnpm dev:web`.

Import-Flow (nach Login): `POST /providers/garmin/connect` → `POST /sync/garmin` →
Daten lesen via `GET /activities`, `GET /daily-health`, `GET /sleep`.

## Hinweise

- Sensible Daten (Gesundheitsdaten, Tokens) werden verschlüsselt behandelt; niemals Secrets committen.
- Der inoffizielle Garmin-Connector ist nur für eigene Accounts gedacht (siehe `docs/open-questions.md`).
