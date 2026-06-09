# Development Workflow

Ziel: `main` bleibt immer stabil. Neue Arbeit passiert ausschliesslich auf
einem eigenen Branch und wird erst nach Checks und Review gemerged.

## Grundregel

**Nie direkt auf `main` entwickeln.**

Vor jedem neuen Thema:

```bash
git checkout main
git pull
git checkout -b <type>/<kurzer-name>
```

Beispiele:

- `chore/branch-workflow-docs`
- `feat/provider-secret-encryption`
- `feat/garmin-auth-flow-stub`
- `feat/sync-job-tracking`
- `fix/api-session-cookie`

## Branch-Typen

- `feat/*` fuer neue Produkt-/Code-Funktionalitaet.
- `fix/*` fuer Bugfixes.
- `chore/*` fuer Tooling, Workflow, nicht-produktive Repo-Arbeit.
- `docs/*` fuer reine Dokumentation.
- `test/*` fuer reine Testabdeckung.

## Arbeitsablauf Pro Thema

1. Von aktuellem `main` starten.
2. Eigenen Branch erstellen.
3. Eng fokussiert implementieren.
4. Keine fremden/unrelated Changes anfassen.
5. Lokal pruefen.
6. Committen.
7. Branch pushen.
8. Erst danach mergen/PR pruefen.

## Pflichtchecks Vor Commit

```bash
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test
```

Wenn ein Check fehlschlaegt:

- Ursache beheben.
- Check erneut ausfuehren.
- Nicht mit bekannten roten Checks committen, ausser wir dokumentieren bewusst,
  warum ein Check aktuell nicht lauffaehig ist.

## Commit-Regeln

Commit-Messages folgen dem bestehenden Stil:

```text
feat(scope): kurze Beschreibung
fix(scope): kurze Beschreibung
chore(scope): kurze Beschreibung
docs(scope): kurze Beschreibung
test(scope): kurze Beschreibung
```

Beispiele:

```text
feat(readiness): Phase-5 Readiness-Engine und Tests
chore(workflow): Branch-Regeln dokumentieren
```

## Secrets Und Lokale Artefakte

Nie committen:

- `.env`
- echte Tokens, Sessions, Garmin-Zugangsdaten
- lokale Python-venvs
- Build-Output (`dist`, `.next`)
- lokale Agent-Artefakte (`.claude`, `.agents`, `CLAUDE.md`, `skills-lock.json`)

Wenn echte Garmin-Integration kommt:

- Zugangsdaten nur lokal eingeben.
- Sessions/Tokens nur verschluesselt speichern.
- Keine Garmin-Schreibaktionen ueber den inoffiziellen Connector.

## Empfohlene Reihenfolge Der Naechsten Branches

1. `feat/provider-secret-encryption`
2. `feat/garmin-auth-flow-stub`
3. `feat/sync-job-tracking`
4. `feat/readiness-history`
5. `feat/web-dashboard-polish`
6. `feat/garmin-real-login`
7. `feat/garmin-real-data-mapping`
8. `feat/coach-recommendations-v0`
9. `feat/claude-explanations`

Diese Reihenfolge schuetzt zuerst sensible Daten und Stabilitaet, bevor echte
Garmin-Daten und spaeter LLM-Erklaerungen ins System kommen.
