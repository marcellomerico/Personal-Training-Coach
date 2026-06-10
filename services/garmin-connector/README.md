# garmin-connector (Python-Service)

Isolierter Connector für die **primäre** Datenquelle Garmin (inoffiziell, `garth`/
`garminconnect`). Liefert normalisierte Daten an den TS-Kern (interne API/DB).

> Status: **Stub.** Datenimport und Auth-Flow sind ohne echten Garmin-Login testbar.

## Stub-Endpunkte
- `POST /auth/start` startet eine MFA-Challenge. Im Stub-Modus lautet der Code `000000`.
- `POST /auth/complete` liefert eine Stub-Session zurück, die die API verschlüsselt in
  `provider_accounts.secrets` speichert.
- `GET /activities`, `GET /daily-health`, `GET /sleep` liefern deterministische Testdaten.

## Geplant
- Echter einmaliger interaktiver Login inkl. **MFA** (E6), danach Token-basiert (`garth`).
- Token-Refresh und robuste Fehlerzustände für abgelaufene Garmin-Sessions.
- Läuft als eigener Container (siehe `docker-compose.yml`, folgt in Phase 2).

## Hinweise
- Nur für **eigene** Garmin-Accounts mit Einverständnis (siehe `docs/open-questions.md`).
- Tokens verschlüsselt behandeln, nie im Klartext loggen.
- Empfohlene Python-Version: **3.11+** (lokal aktuell 3.9 – bitte vor Phase 2 aktualisieren).
