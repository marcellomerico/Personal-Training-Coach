# @ptc/web

Web-App MVP (Phase 4) – Next.js (App Router, TypeScript).

Reiner Client für die NestJS-API (`@ptc/api`): Auth via httpOnly-Session-Cookie
(Cross-Origin mit `credentials: "include"`), Daten über die bestehenden
REST-Endpunkte. Kein eigenes Backend, keine Server-seitigen DB-Zugriffe.

## Seiten

- `/login`, `/register` – Auth (Register/Login/Logout, Fehleranzeige)
- `/dashboard` – nur für eingeloggte Nutzer: Status, Readiness-Karte
  (Score 0–100, Entscheidung, kurze Begründung – Phase 5; Hinweis, falls noch
  keine Bewertung berechnet wurde), letzte Aktivität, Health-Werte (HRV,
  Ruhepuls, Body Battery, Stress, Schritte), Schlaf (Dauer, Sleep Score,
  Tief/REM/Wach), Buttons „Garmin verbinden" / „Sync"
- `/` – leitet je nach Login-Status auf `/dashboard` oder `/login`

## Entwicklung

```bash
pnpm dev:all   # API (3001), Garmin-Connector, Worker (Backend)
pnpm dev:web   # Web-App auf http://localhost:3000
```

Browser: **http://localhost:3000**

Die API-Basis-URL ist per Default `http://localhost:3001` und über
`NEXT_PUBLIC_API_BASE_URL` überschreibbar. Die API erlaubt CORS für
`WEB_ORIGIN` (Default `http://localhost:3000`) mit Credentials.
