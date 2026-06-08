# TrainingsKi – Persönliches KI-Coach-System für Sport & Gesundheit

Ein privates, multi-user-fähiges KI-Coach-System für Ausdauersport und Gesundheit.
Es importiert Trainings- und Gesundheitsdaten (primär **Garmin**, sekundär **Strava**),
analysiert Belastung und Erholung und gibt **nachvollziehbare** Trainings-, Recovery- und
Ernährungs-Empfehlungen – über einen **Telegram-Bot** (schnelle Interaktion) und eine
**Web-App** (Hauptplattform).

> Status: **Phase 0 abgeschlossen (Planung).** Implementierung startet als Nächstes.

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

## Hinweise

- Sensible Daten (Gesundheitsdaten, Tokens) werden verschlüsselt behandelt; niemals Secrets committen.
- Der inoffizielle Garmin-Connector ist nur für eigene Accounts gedacht (siehe `docs/open-questions.md`).
