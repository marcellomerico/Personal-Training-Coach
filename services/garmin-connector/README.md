# garmin-connector (Python-Service)

Isolierter Connector für die **primäre** Datenquelle Garmin (inoffiziell, `garth`/
`garminconnect`). Liefert normalisierte Daten an den TS-Kern (interne API/DB).

> Status: **Stub.** Datenimport und Auth-Flow sind ohne echten Garmin-Login testbar.

## Provider-Modi (Stub vs. Real)

Die Endpunkte delegieren an einen Provider (`app/provider.py`), gesteuert über
`GARMIN_STUB_MODE`:

- `GARMIN_STUB_MODE=true` (Default) → **StubGarminProvider**: deterministische
  Testdaten, unverändert.
- `GARMIN_STUB_MODE=false` → **RealGarminProvider**: Grundstruktur für den echten
  Login. Noch **kein** Login implementiert; jeder Aufruf endet mit einer klaren,
  kontrollierten Fehlermeldung:
  - **503**, wenn `garth`/`garminconnect` nicht installiert sind.
  - **503**, wenn `GARMIN_EMAIL`/`GARMIN_PASSWORD` nicht gesetzt sind.
  - **501**, wenn Pakete + Zugangsdaten vorhanden sind, aber der Login noch
    aussteht (folgt in `feat/garmin-real-login`).

## Stub-Endpunkte
- `POST /auth/start` startet eine MFA-Challenge. Im Stub-Modus lautet der Code `000000`.
- `POST /auth/complete` liefert eine Stub-Session zurück, die die API verschlüsselt in
  `provider_accounts.secrets` speichert.
- `GET /activities`, `GET /daily-health`, `GET /sleep` liefern deterministische Testdaten.

## Echter Login (garth/garminconnect)

Manuelle Schritte, um den Real-Modus vorzubereiten (Login selbst folgt separat):

1. Pakete installieren (in der venv des Connectors):
   ```bash
   services/garmin-connector/.venv/bin/pip install garth garminconnect
   ```
   In `requirements.txt` sind sie als Kommentar vermerkt und werden bei der
   echten Umsetzung aktiviert.
2. Zugangsdaten **nur lokal** in der Umgebung setzen (niemals committen/loggen):
   ```bash
   export GARMIN_EMAIL="..."
   export GARMIN_PASSWORD="..."
   ```
3. Real-Modus aktivieren: `GARMIN_STUB_MODE=false`.
4. MFA/2FA: Garmin fragt beim Erstlogin häufig einen Code ab. Der Flow läuft über
   `POST /auth/start` (Challenge) und `POST /auth/complete` (Code) – analog zum Stub.
5. Ergebnis: `garth`-Session/Tokens werden an die API zurückgegeben und dort
   verschlüsselt in `provider_accounts.secrets` gespeichert. Passwörter werden
   **nicht** dauerhaft gespeichert.

## Geplant
- Echter einmaliger interaktiver Login inkl. **MFA** (E6), danach Token-basiert (`garth`).
- Token-Refresh und robuste Fehlerzustände für abgelaufene Garmin-Sessions.
- Läuft als eigener Container (siehe `docker-compose.yml`, folgt in Phase 2).

## Hinweise
- Nur für **eigene** Garmin-Accounts mit Einverständnis (siehe `docs/open-questions.md`).
- Tokens verschlüsselt behandeln, nie im Klartext loggen.
- Empfohlene Python-Version: **3.11+** (lokal aktuell 3.9 – bitte vor Phase 2 aktualisieren).
