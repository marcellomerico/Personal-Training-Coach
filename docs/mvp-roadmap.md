# MVP & Roadmap – Entwicklungsphasen

> Status: Planung (Phase 0). Keine Implementierung.
> Ziel: schnell ein brauchbares System für 2 private Nutzer, sauber gebaut,
> ohne Überladung.

---

## 1. Roadmap in Phasen

Jede Phase hat **Ergebnisse (Deliverables)**, **Abhängigkeiten** und ein klares
**„fertig wenn“**-Kriterium.

### Phase 0 – Planung & Architektur *(diese Phase)*
- **Ergebnisse:** Diese Planungsdokumente in `/docs`, Tech-Stack-Entscheidung,
  offene Fragen beantwortet (mindestens die „Blocker“).
- **Abhängigkeiten:** keine.
- **Fertig wenn:** Architektur, Datenmodell, MVP-Scope und Tech-Stack bestätigt sind
  und die Blocker-Fragen (s. open-questions §„Blocker“) entschieden wurden.

### Phase 1 – Grundgerüst, Auth & lokaler Betrieb
- **Ergebnisse:**
  - Monorepo-Skeleton (`apps/web`, `apps/api`, `apps/bot`, `apps/worker`,
    `services/garmin-connector`, `packages/*`).
  - Lokales Setup (`docker compose up` für Postgres + alle Services); dasselbe Compose
    läuft 24/7 auf dem **kostenlosen Always-Free-Cloud-Tier** (E4, Empfehlung Oracle Cloud
    Always Free); Zugriff via **Tailscale** (E8).
  - DB-Schema/Migrations für Kern-Entities (`users`, `user_profiles`,
    `provider_accounts`, `sync_jobs`).
  - Auth: Registrierung/Login (Web), Sessions, Rollen.
  - Telegram-Account-Verknüpfung (Deep-Link/Token) – nur Verknüpfung, noch keine Features.
  - Bot läuft per **Long-Polling**, `restart: always` + Healthchecks.
  - Tailscale auf der VM eingerichtet (Zugriff ohne offenen Port).
  - CI: Lint/Typecheck/Test-Gerüst.
- **Abhängigkeiten:** Phase 0 (insb. Q10: Free-Tier-Anbieter bestätigt).
- **Fertig wenn:** Ein Nutzer kann sich registrieren, einloggen und seinen
  Telegram-Account verknüpfen; Stack läuft stabil 24/7 auf dem Free-Tier, Bot erreichbar.

### Phase 2 – Datenimport (Garmin als primäre Quelle)
- **Ergebnisse:**
  - `SourceConnector`-Interface + **Garmin-Connector** (Python-Service `garth`/
    `garminconnect`) + TS-Client in `packages/connectors/garmin`.
  - Einmaliger Garmin-Login (inkl. MFA), danach Token-basiert; Tokens verschlüsselt.
  - Backfill + inkrementeller Sync des **vollen Programms**: Aktivitäten, HRV, Schlaf,
    Ruhepuls, Stress, Body Battery, Training Readiness, Trainingsstatus (soweit verfügbar).
  - `raw_imports` + Normalisierung (`activities`, `daily_health_metrics`,
    `sleep_records`, ...); idempotent.
  - `sync_jobs`-Protokollierung, Worker/Scheduler (nächtlich + manuell per `/sync`).
  - Daten lokal persistent → nutzbar auch bei Garmin-Ausfall.
  - Einmaliger interaktiver Garmin-Login (MFA, E6); danach Token-Refresh.
  - **Strava-Connector** als sekundäre Aktivitätsquelle (E7) + Dedup gegen Garmin.
- **Abhängigkeiten:** Phase 1.
- **Fertig wenn:** Garmin verbinden → volles Datenprogramm landet normalisiert in der DB,
  erneuter Sync dupliziert nicht, Bestandsdaten bleiben bei Sync-Fehler verfügbar.

### Phase 3 – Telegram-Bot MVP
- **Ergebnisse:**
  - Bot-Service (grammY), ruft API/Core.
  - Commands: `/start`+Verknüpfung, `/today`, `/last`, `/sync`, `/help`.
  - Tageszusammenfassung nutzt einfache Analyse (aus Phase 2/teilweise 5).
- **Abhängigkeiten:** Phase 1 (Auth/Verknüpfung), Phase 2 (Daten).
- **Fertig wenn:** Beide Nutzer können im Bot ihre Tageszusammenfassung & letzte
  Aktivität abrufen.

### Phase 4 – Web-App MVP
- **Ergebnisse:**
  - Onboarding inkl. Strava-Verbindung.
  - Dashboard „Today“ (Status, Empfehlung, „Warum?“, Wochen-Snapshot).
  - Aktivitätsliste + Detailansicht.
  - Sync-Status sichtbar, manueller Re-Sync.
- **Abhängigkeiten:** Phase 1–2 (3 parallel möglich).
- **Fertig wenn:** Beide Nutzer sehen ihre Daten & Empfehlung im Web.

### Phase 5 – KI-Coach & Analyse (schließt MVP-Core ab)
- **Ergebnisse:**
  - Analyse-Engine: **CTL/ATL/TSB** (longitudinal, persistent), Recovery/Readiness-Heuristik
    (Garmin HRV/Schlaf/Ruhepuls/Readiness als primäre Signale), Datenqualitäts-Checks.
  - Regelbasierte Empfehlungen + **Claude-Erklärung** (abschaltbar, datenminimiert).
  - Coach-Chat (Bot + Web), Explainability-Ansicht.
  - Verlaufs-/Trend-Charts, Recovery-Ansicht.
- **Abhängigkeiten:** Phase 2 (Daten), Phase 4 (Anzeige).
- **Fertig wenn:** Empfehlungen sind datenbasiert, nachvollziehbar und im Bot+Web abrufbar.
  → **Damit ist der MVP-Core lauffähig.**

### Phase 6 – MVP-Extended: Schwellen/Zonen + Zyklus + Ernährung (S1/S2)
- **Ergebnisse:**
  - `training_thresholds` (FTP/Schwellen/Zonen, versioniert) + Zonen-Neuberechnung.
  - `health_events` (Verletzungen/Krankheit) als Leitplanken im Coach.
  - **Zyklus-Tracking** (`menstrual_cycles`, opt-in) + deterministische Phase +
    phasenbewusste Empfehlungen (mit Disclaimer).
  - **Ernährungs-Guidance v0** (`nutrition_recommendations`, kein Food-Logging, Disclaimer).
- **Abhängigkeiten:** Phase 5 (Analyse/Coach-Kern).
- **Fertig wenn:** Empfehlungen berücksichtigen Zonen, Zyklusphase und liefern grobe
  Ernährungs-Guidance – nachvollziehbar erklärt.

### Phase 7 – MVP-Extended: Workout-Erzeugung + Write-back (S3)
- **Ergebnisse:**
  - Strukturierte Workouts erzeugen (`workouts.structure`).
  - **Datei-Export** (`.FIT`/strukturiert) + optional Push an **intervals.icu** (offizielle API).
  - **Kein** Write-back über den inoffiziellen Garmin-Connector (R-T11).
- **Abhängigkeiten:** Phase 6 (Zonen/Plan-Logik).
- **Fertig wenn:** Ein vorgeschlagenes Workout kann exportiert / zu intervals.icu gepusht werden.

### Spätere Phasen (nach MVP)
- **Offizielle** Garmin-API (sobald Zugang) – ersetzt inoffiziellen Connector.
- Strava-Webhooks für Near-Realtime; Trainingsplanung/Kalender, Periodisierung.
- Write-back an Garmin/TrainingPeaks/Zwift über offizielle Wege; weitere Quellen
  (intervals.icu/Oura/Apple Health).
- DSGVO-Tooling (Export/Löschung-UI), Audit-Log, Rate-Limiting.

---

## 2. Abhängigkeits-Übersicht

```
Phase 0 ─► Phase 1 ─► Phase 2 ─┬─► Phase 3 (Bot MVP)
                               ├─► Phase 4 (Web MVP)
                               └─► Phase 5 (KI-Coach)  ──► [MVP-Core fertig]
                                                              │
                                            Phase 6 (Zonen/Zyklus/Ernährung)
                                                              │
                                            Phase 7 (Workout-Export/Write-back)
```
Phase 3 und 4 laufen nach Phase 2 **parallel**. Phasen 6–7 = **MVP-Extended** (gewünschte
Zusatzfeatures), bewusst **nach** dem lauffähigen Core.

---

## 3. MVP-Definition (für 2 private Nutzer)

> Der MVP ist in **Core** (zuerst lauffähig, Phasen 1–5) und **Extended** (gewünschte
> Zusatzfeatures, Phasen 6–7) geteilt. Begründung s. §3.4 (Architekt-Hinweis zum Umfang).

### 3.1 MVP-Core – muss zuerst stehen
- **Auth & Multi-User** mit strikter Datentrennung.
- **Telegram-Verknüpfung** je Nutzer; Bot **dauerhaft erreichbar** (Long-Polling, 24/7
  auf dem Free-Tier).
- **Garmin-Anbindung als primäre Quelle** (inoffizieller Connector, MFA-Login) +
  automatischer, idempotenter Import des vollen Programms (Aktivitäten, HRV, Schlaf,
  Ruhepuls, Stress, Body Battery, Training Readiness, Trainingsstatus).
- **Strava** als sekundäre Aktivitätsquelle (E7) inkl. Deduplizierung gegen Garmin.
- **Lokale Persistenz** aller Garmin-Daten (nutzbar bei Sync-Ausfall).
- **Normalisiertes Datenmodell** + Sync-Protokoll (`sync_jobs`).
- **Analyse:** **CTL/ATL/TSB** (longitudinal, persistent) + Recovery/Readiness-Heuristik
  (Garmin HRV/Schlaf/Ruhepuls) + Datenqualitäts-Checks.
- **Regelbasierte Tagesempfehlung mit Begründung** („Warum?“) + Claude-Erklärung.
- **Bot:** `/today`, `/last`, `/sync`.
- **Web:** Onboarding, Dashboard „Today“, Aktivitätsliste/-detail.
- **Betrieb:** Docker Compose 24/7 auf kostenlosem Free-Tier; Zugriff via **Tailscale**.
- **Security-Basis:** Tokens/Daten verschlüsselt at rest, user-scoped Queries, Secrets via Env.

### 3.2 MVP-Extended – gewünschte Zusatzfeatures (nach dem Core)
- **Schwellen/Zonen-Management** (`training_thresholds`) + **Kontext-Gedächtnis**
  (`health_events`).
- **Zyklus-Tracking** (`menstrual_cycles`, opt-in) + phasenbewusste Empfehlungen (Disclaimer).
- **Ernährungs-Guidance v0** (`nutrition_recommendations`; **kein** Food-Logging; Disclaimer).
- **Workout-Erzeugung + Write-back**: Datei-Export (`.FIT`/strukturiert) + optional
  **intervals.icu** (offizielle API). **Nicht** über Garmin-Connector (R-T11).

### 3.3 Bewusst NICHT im MVP (Core oder Extended)
- **Offizielle** Garmin-API (kommt später; MVP nutzt inoffiziellen Connector).
- **Vollständiges Food-Logging / Lebensmittel-DB / Makro-Tracking** (nur Guidance v0).
- **Write-back über den inoffiziellen Garmin-Connector** (R-T11) sowie an TrainingPeaks/
  Zwift (nur über offizielle Wege, später).
- Weitere Quellen (Oura/intervals.icu-Import/Apple Health/Health Connect).
- Trainingsplanung/Kalender, Periodisierung; Near-Realtime/Webhooks.
- Kostenpflichtiger Server; öffentlich offene Ports (Zugriff via Tailscale).
- Native Mobile-Apps, soziale Features; ausgefeiltes Audit-Log/Rate-Limiting.

### 3.4 Leitlinie & Architekt-Hinweis zum Umfang
> Erst die Kette **Import → Normalisierung → Analyse (CTL/ATL/TSB + Readiness) → Anzeige/
> Empfehlung** für die **primäre Quelle (Garmin)** sauber schließen (= MVP-Core). Da alles
> an Garmin hängt, ist ein **robuster, isolierter Garmin-Connector mit lokaler Persistenz**
> der wichtigste Baustein.
>
> **Ehrlicher Hinweis:** Zyklus, Ernährung und Write-back (Extended) erhöhen den MVP-Umfang
> spürbar. Empfehlung: erst den Core 2–3 Wochen real nutzen, dann Extended ergänzen. So
> bleibt „schnell brauchbar" erhalten, ohne den Start zu überladen. Write-back bewusst nur
> über sichere Wege (Datei/intervals.icu), um die kritische Garmin-Quelle nicht zu gefährden.
