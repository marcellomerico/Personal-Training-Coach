# garmin-connector (Python-Service)

Isolierter Connector für die **primäre** Datenquelle Garmin (inoffiziell, `garth`/
`garminconnect`). Liefert normalisierte Daten an den TS-Kern (interne API/DB).

> Status: **Stub.** Datenimport und Auth-Flow sind ohne echten Garmin-Login testbar.

## Provider-Modi (Stub vs. Real)

Die Endpunkte delegieren an einen Provider (`app/provider.py`), gesteuert über
`GARMIN_STUB_MODE`:

- `GARMIN_STUB_MODE=true` (Default) → **StubGarminProvider**: deterministische
  Testdaten, unverändert.
- `GARMIN_STUB_MODE=false` → **RealGarminProvider**: echter Garmin-Login über
  `garth` (inkl. MFA). Kontrollierte Fehler, wenn Voraussetzungen fehlen:
  - **503**, wenn `garth`/`garminconnect` nicht installiert sind.
  - **503**, wenn `GARMIN_EMAIL`/`GARMIN_PASSWORD` nicht gesetzt sind.
  - **502**, wenn der Login/MFA-Abschluss bei Garmin fehlschlägt.
  - **501** bei `GET /activities|daily-health|sleep` – der echte Datenabruf
    folgt in `feat/garmin-real-data-mapping`. Der Login (start/complete) ist
    bereits aktiv.

## Stub-Endpunkte
- `POST /auth/start` startet eine MFA-Challenge. Im Stub-Modus lautet der Code `000000`.
- `POST /auth/complete` liefert eine Stub-Session zurück, die die API verschlüsselt in
  `provider_accounts.secrets` speichert.
- `GET /activities`, `GET /daily-health`, `GET /sleep` liefern deterministische Testdaten.

## Echter Login (garth/garminconnect)

Der Login ist implementiert. Manuelle Schritte zum lokalen Testen:

1. Pakete installieren (in der venv des Connectors):
   ```bash
   services/garmin-connector/.venv/bin/pip install garth garminconnect
   ```
   In `requirements.txt` sind sie als Kommentar vermerkt; bewusst optional, damit
   der Stub-Betrieb schlank bleibt.
2. Zugangsdaten **nur lokal** in der Umgebung setzen (niemals committen/loggen):
   ```bash
   export GARMIN_EMAIL="..."
   export GARMIN_PASSWORD="..."
   ```
3. Real-Modus aktivieren: `GARMIN_STUB_MODE=false`.
4. Login-Flow (zweistufig, identisch zum Stub-HTTP-Interface):
   - `POST /auth/start` → startet den garth-Login mit den Umgebungs-Zugangsdaten.
     Verlangt Garmin MFA, kommt `mfaRequired: true` + eine `challengeId` zurück.
   - `POST /auth/complete` mit `challengeId` + `mfaCode` (der von Garmin per
     App/SMS/E-Mail gesendete 2FA-Code) → schliesst den Login ab.
5. Ergebnis: die `garth`-Session (Token-String) wird unter `secrets` an die API
   zurückgegeben und dort verschlüsselt in `provider_accounts.secrets`
   gespeichert. Das **Passwort wird nicht gespeichert und nicht geloggt**.

> Der echte Datenabruf (`/activities`, `/daily-health`, `/sleep`) folgt in
> `feat/garmin-real-data-mapping`; bis dahin antworten diese im Real-Modus mit 501.

## Geplant
- Echter einmaliger interaktiver Login inkl. **MFA** (E6), danach Token-basiert (`garth`).
- Token-Refresh und robuste Fehlerzustände für abgelaufene Garmin-Sessions.
- Läuft als eigener Container (siehe `docker-compose.yml`, folgt in Phase 2).

## Hinweise
- Nur für **eigene** Garmin-Accounts mit Einverständnis (siehe `docs/open-questions.md`).
- Tokens verschlüsselt behandeln, nie im Klartext loggen.
- Empfohlene Python-Version: **3.11+** (lokal aktuell 3.9 – bitte vor Phase 2 aktualisieren).
