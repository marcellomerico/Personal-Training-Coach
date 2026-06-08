# garmin-connector (Python-Service)

Isolierter Connector für die **primäre** Datenquelle Garmin (inoffiziell, `garth`/
`garminconnect`). Liefert normalisierte Daten an den TS-Kern (interne API/DB).

> Status: **Stub (Phase 1).** Vollständige Implementierung in **Phase 2 (Datenimport)**.

## Geplant
- Einmaliger interaktiver Login inkl. **MFA** (E6), danach Token-basiert (`garth`).
- Endpunkte: `fetch_activities`, `fetch_health_metrics`, `refresh_token`.
- Läuft als eigener Container (siehe `docker-compose.yml`, folgt in Phase 2).

## Hinweise
- Nur für **eigene** Garmin-Accounts mit Einverständnis (siehe `docs/open-questions.md`).
- Tokens verschlüsselt behandeln, nie im Klartext loggen.
- Empfohlene Python-Version: **3.11+** (lokal aktuell 3.9 – bitte vor Phase 2 aktualisieren).
