# Requirements – Funktionale & nicht-funktionale Anforderungen

> Legende Priorität:
> - **[MVP]** = MVP-Core: zwingend für erstes nutzbares System (2 Nutzer), zuerst bauen
> - **[MVP-Ext]** = im MVP-Ziel enthalten, aber nach dem Core (Zyklus/Ernährung/Write-back)
> - **[V1]** = kurz nach MVP, hoher Wert
> - **[Later]** = bewusst später / optional
>
> Legende Quelle: `Bot` = relevant für Telegram-Bot, `Web` = Web-App, `Core` = Backend.

## 1. Funktionale Anforderungen

### 1.1 Accounts, Auth & Multi-User
- **FR-A1 [MVP] (Core/Web):** Nutzer können sich registrieren und einloggen.
- **FR-A2 [MVP] (Core):** Jeder Nutzer hat strikt getrennte Daten, Tokens und Einstellungen.
- **FR-A3 [MVP] (Core/Bot):** Telegram-Account kann mit einem App-Account verknüpft
  werden (eindeutige Zuordnung Telegram-User ↔ App-User).
- **FR-A4 [V1] (Core):** Rollen/Berechtigungen (mind. `user`, `admin`).
- **FR-A5 [Later] (Core):** Einladungs-/Freigabe-Mechanismus (z. B. Partner/Coach).
- **FR-A6 [V1] (Web):** Nutzer kann eigenen Account inkl. aller Daten löschen (DSGVO).

### 1.2 Datenquellen & Import (Connectors)
> **Priorisierung geändert (E1):** Garmin ist die **primäre** Quelle und im MVP zwingend.
> Strava wird optional/sekundär.
- **FR-D1 [MVP] (Core):** **Garmin** als primäre Quelle anbinden (inoffizieller Connector,
  Python-Service via `garth`/`garminconnect`), für eigene Accounts mit Einverständnis.
- **FR-D2 [MVP] (Core):** Von Garmin das **volle Programm** importieren: Aktivitäten, HRV,
  Schlaf, Ruhepuls, Stress, Body Battery, Training Readiness/Trainingsbereitschaft,
  Trainingsstatus (soweit verfügbar) – initialer Backfill + laufender Sync.
- **FR-D3 [MVP] (Core):** Garmin-Login einmalig (inkl. MFA), danach nur **Tokens**
  verschlüsselt speichern; Token-Refresh automatisch.
- **FR-D4 [MVP] (Core):** Import-Vorgänge werden als `sync_jobs` protokolliert
  (Status, Fehler, letzter erfolgreicher Stand).
- **FR-D5 [MVP] (Core):** Idempotenter Import (kein Duplizieren bei erneutem Sync).
- **FR-D6 [MVP] (Core):** Alle abgerufenen Garmin-Daten **lokal persistent** speichern →
  System bleibt mit Bestandsdaten nutzbar, wenn Garmin zeitweise nicht erreichbar ist.
- **FR-D7 [MVP] (Core):** **Strava** via offizielle OAuth2-API als **sekundäre**
  Aktivitätsquelle/Fallback (E7).
- **FR-D8 [Later] (Core):** **Offizielle** Garmin-API als austauschbarer Connector hinter
  demselben Interface (sobald Zugang gewährt).
- **FR-D9 [Later] (Core):** Manuelle Einträge (Aktivität/Schlaf/Gewicht) über Web/Bot.
- **FR-D10 [Later] (Core):** Apple Health / Health Connect Import.
- **FR-D11 [V1] (Web):** Nutzer sieht Sync-Status & kann manuellen Re-Sync auslösen
  (auch per Bot `/sync`).

### 1.3 Datenverarbeitung & Normalisierung
- **FR-P1 [MVP] (Core):** Provider-Rohdaten werden roh gespeichert (Audit/Reprocessing).
- **FR-P2 [MVP] (Core):** Aktivitäten werden in ein normalisiertes Schema überführt.
- **FR-P3 [MVP] (Core):** Deduplizierung gleicher Aktivitäten aus mehreren Quellen
  (z. B. Strava + Garmin) über Heuristik (Zeit/Dauer/Distanz). *(Regel offen, s. Q)*
- **FR-P4 [V1] (Core):** Re-Processing: Analyse kann auf historischen Rohdaten neu laufen.

### 1.4 Analyse-Engine
- **FR-AN1 [MVP] (Core):** Trainingslast pro Aktivität & aggregiert (Tag/Woche).
- **FR-AN2 [MVP] (Core):** Verlauf: Wochenvolumen, Distanz, Dauer, einfache Trends.
- **FR-AN3 [MVP] (Core):** **Longitudinale Last persistent fortschreiben:** CTL (chronisch),
  ATL (akut), **TSB = CTL − ATL** (Form). Bildet die Basis für Empfehlungen.
- **FR-AN4 [V1] (Core):** Recovery-/Readiness-Heuristik aus Schlaf/HRV/Ruhepuls (Garmin).
- **FR-AN5 [V1] (Core):** **Schwellen/Zonen-Management:** FTP, Schwellen-HR/-Pace, max. HR
  versioniert; Zonen bei Fitness-Änderung neu berechnen (`training_thresholds`).
- **FR-AN6 [V1] (Core):** **Kontext-Gedächtnis:** Verletzungen/Krankheit/Pausen
  (`health_events`) als Leitplanken in Empfehlungen berücksichtigen.
- **FR-AN7 [MVP] (Core):** **Datenqualitäts-Checks:** unplausible/fehlende Werte erkennen
  und kennzeichnen ("garbage in → garbage out" vermeiden).
- **FR-AN8 [Later] (Core):** Periodisierung & Soll/Ist-Abgleich gegen Trainingsplan.

### 1.5 KI-Coach / Empfehlungen
- **FR-AI1 [MVP] (Core):** Regelbasierte Tagesempfehlung (z. B. „leicht / Ruhe / intensiv“).
- **FR-AI2 [MVP] (Core):** Jede Empfehlung enthält eine nachvollziehbare Begründung
  (welche Datenpunkte/Regeln).
- **FR-AI3 [V1] (Core):** **Claude**-gestützte Erklärung/Formulierung der Empfehlung in
  Klartext (abschaltbar, nur strukturierte Eingaben, Datenminimierung).
- **FR-AI4 [V1] (Core):** Chat mit Coach (Fragen zu eigenen Daten) im Bot & Web.
- **FR-AI5 [Later] (Core):** Trainingsplan-Vorschläge mit Zielbezug (z. B. 10k-Ziel).
- **FR-AI6 [Later] (Core):** Adaptive Anpassung des Plans an Recovery-Signale.

### 1.6 Telegram-Bot
- **FR-B1 [MVP] (Bot):** Account-Verknüpfung per Token/Deep-Link.
- **FR-B2 [MVP] (Bot):** `/today` – Tageszusammenfassung & Empfehlung.
- **FR-B3 [MVP] (Bot):** `/last` – letzte Aktivität(en) kurz.
- **FR-B4 [V1] (Bot):** Freitext-Chat an den KI-Coach.
- **FR-B5 [V1] (Bot):** Einfache Visualisierung (Chart als Bild, z. B. Wochenlast).
- **FR-B6 [Later] (Bot):** Proaktive Push-Nachrichten (z. B. Morgens-Briefing).

### 1.7 Web-App
- **FR-W1 [MVP] (Web):** Onboarding inkl. Strava-Verbindung.
- **FR-W2 [MVP] (Web):** Dashboard (Status heute, letzte Woche, Empfehlung).
- **FR-W3 [MVP] (Web):** Aktivitätsliste + Detailansicht.
- **FR-W4 [V1] (Web):** Verlaufs-/Trend-Charts mit Zeitraumauswahl.
- **FR-W5 [V1] (Web):** Recovery/Readiness-Ansicht.
- **FR-W6 [Later] (Web):** Trainingsplanung & Kalender.
- **FR-W7 [Later] (Web):** Drilldowns/Vergleiche, exportierbare Reports.

### 1.9 Erweiterte MVP-Features (aus Orientierung; bewusst schlank, „MVP-Extended")
> Reihenfolge-Empfehlung: erst MVP-Core (1.1–1.8), dann diese Features.
- **FR-CY1 [MVP-Ext] (Core/Web/Bot):** Menstruationszyklus erfassen (Periodenstart, optional
  Symptome) – manuell; optional Garmin „Women's Health"-Daten falls verfügbar.
- **FR-CY2 [MVP-Ext] (Core):** Zyklusphase (Menstruation/Follikel/Ovulation/Luteal)
  **deterministisch** ableiten.
- **FR-CY3 [MVP-Ext] (Core):** Empfehlungen phasenbewusst anpassen (opt-in, Disclaimer,
  keine medizinischen Aussagen).
- **FR-NU1 [MVP-Ext] (Core):** Ernährungs-**Guidance** v0: grobe Tagesrichtwerte
  (Kalorien-/Makro-Richtung, Hydration, Timing ums Training) aus Last/Zielen/Phase.
- **FR-NU2 [MVP-Ext] (Core):** Claude erklärt die Guidance; **kein** Food-Logging/keine
  Lebensmittel-DB in v0; Disclaimer „keine diätetische/medizinische Beratung".
- **FR-WB1 [MVP-Ext] (Core):** Strukturiertes Workout erzeugen und als **Datei exportieren**
  (z. B. `.FIT`/strukturiertes Format) zum manuellen Import.
- **FR-WB2 [MVP-Ext] (Core):** Optionaler Push an **intervals.icu** (offizielle API).
- **FR-WB3 [Later] (Core):** Write-back an Garmin/TrainingPeaks/Zwift – **nur über
  offizielle Wege**, bewusst NICHT über den inoffiziellen Garmin-Connector (s. R-T11).

### 1.8 Scheduler / Background Jobs
- **FR-S1 [MVP] (Core):** Geplanter periodischer Sync je Nutzer.
- **FR-S2 [MVP] (Core):** Token-Refresh vor Ablauf.
- **FR-S3 [V1] (Core):** Nächtliche Analyse-/Insight-Berechnung.
- **FR-S4 [V1] (Core):** Retry/Backoff bei fehlgeschlagenen Jobs.

## 2. Nicht-funktionale Anforderungen

### 2.1 Sicherheit & Datenschutz
- **NFR-SEC1 [MVP]:** OAuth-Tokens verschlüsselt at rest speichern.
- **NFR-SEC2 [MVP]:** Transport ausschließlich über HTTPS/TLS.
- **NFR-SEC3 [MVP]:** Strikte Mandantentrennung – jede DB-Query ist user-scoped.
- **NFR-SEC4 [MVP]:** Secrets nie im Code/Repo; via Env/Secret-Store.
- **NFR-SEC5 [V1]:** Audit-Log für sensible Aktionen (Login, Token, Export, Delete).
- **NFR-SEC6 [V1]:** DSGVO: Export & vollständige Löschung der Nutzerdaten.
- **NFR-SEC7 [Later]:** Rate-Limiting & Brute-Force-Schutz auf Auth-Endpunkten.

### 2.2 Datenschutz-spezifisch (Gesundheitsdaten)
- **NFR-PRIV1 [MVP]:** Gesundheitsdaten gelten als besonders schützenswert
  (DSGVO Art. 9) → Zugriff minimal, nur eigener Nutzer.
- **NFR-PRIV2 [V1]:** Chatverläufe sind privat; klar dokumentieren, ob/welche Daten
  an externe LLM-Anbieter gehen (Datenminimierung, ggf. Pseudonymisierung).

### 2.3 Zuverlässigkeit & Datenqualität
- **NFR-REL1 [MVP]:** Import ist idempotent und wiederanlauffähig.
- **NFR-REL2 [MVP]:** Fehlgeschlagene Syncs blockieren nicht den Rest des Systems.
- **NFR-REL3 [V1]:** Beobachtbarkeit: strukturierte Logs + Job-Status sichtbar.

### 2.4 Wartbarkeit & Developer Experience
- **NFR-DX1 [MVP]:** Gemeinsame Domain-Logik nur an **einer** Stelle (kein Copy-Paste
  zwischen Bot und Web).
- **NFR-DX2 [MVP]:** Einheitliche Sprache/Typen über alle Komponenten (Typsicherheit).
- **NFR-DX3 [MVP]:** Lokales Setup mit einem Befehl (z. B. `docker compose up`).
- **NFR-DX4 [V1]:** Automatisierte Tests für Kern-Domain (Analyse, Normalisierung).

### 2.5 Verfügbarkeit & Betrieb (kostenloser Always-Free-Cloud-Tier)
- **NFR-AVAIL1 [MVP]:** **Telegram-Bot dauerhaft erreichbar** – läuft per Long-Polling
  (kein offener Port) 24/7 auf dem **Always-Free-Cloud-Tier** (E4). Web-App on demand.
- **NFR-AVAIL2 [MVP]:** Always-on-Komponenten (DB, API, Worker, Bot, Garmin-Connector)
  starten nach Host-Neustart automatisch (Docker `restart: always`, Healthchecks).
- **NFR-AVAIL3 [MVP]:** Garmin-Sync-Ausfall darf den Bot/Web-Betrieb mit Bestandsdaten
  nicht blockieren (Resilienz, vgl. FR-D6).
- **NFR-AVAIL4 [MVP]:** Zugriff auf Web-App/Admin **ohne öffentlich offenen Port**, via
  **Tailscale** (E8).
- **NFR-AVAIL5 [V1]:** Setup ist portabel (Docker Compose) → Wechsel Free-Tier ↔ Heimgerät
  ohne Code-Änderung möglich.

### 2.6 Performance & Skalierbarkeit
- **NFR-PERF1 [MVP]:** Bot-Antworten auf Standardabfragen < 2 s (gecachte Tageswerte).
- **NFR-PERF2 [V1]:** Analyse läuft asynchron, nicht im Request-Pfad.
- **NFR-SCALE1 [Later]:** Architektur erlaubt mehr Nutzer ohne Neubau (zustandslose API);
  bei lokalem Hosting ist die Skalierung durch die Heim-Hardware begrenzt (bewusst ok).

### 2.7 Portabilität & Erweiterbarkeit
- **NFR-EXT1 [MVP]:** Neue Datenquelle = neuer Connector hinter bestehendem Interface,
  ohne Änderung an Analyse/UI.
- **NFR-EXT2 [MVP]:** Garmin-Connector austauschbar (inoffiziell → offiziell), ohne
  Änderung an Analyse/UI.
- **NFR-EXT3 [V1]:** KI-Coach-Logik austauschbar (Regeln/Modelle/LLM-Anbieter; Default Claude).

### 2.8 Kosten
- **NFR-COST1 [MVP]:** **Kein kostenpflichtiger Server** → Betriebskosten im Free-Tier
  ~ 0 € (Always-Free-Cloud-Tier).
- **NFR-COST2 [MVP]:** Claude-Kosten begrenzbar (Caching, Budget-Limits, Fallback ohne LLM).

## 3. Out of Scope (MVP – bewusst nicht)
- Native Mobile-Apps (iOS/Android).
- Echtzeit-Live-Tracking während des Trainings.
- Soziale Features / Vergleich mit anderen Nutzern.
- Komplexe Periodisierungs-/Wettkampfplanung.
- Kostenpflichtiger Server / Managed Cloud (bewusst kostenloser Always-Free-Tier, s. E4).
- Öffentlich offene Ports / öffentlicher Zugang für fremde Nutzer (Zugriff via Tailscale;
  inoffizieller Garmin-Connector nur für **eigene** Accounts).
- Strava-Webhooks / Near-Realtime (zunächst periodischer Sync).
- **Vollständiges Food-Logging / Lebensmittel-Datenbank / Makro-Tracking** (nur
  Ernährungs-Guidance v0, s. FR-NU1).
- **Workout-Write-back über den inoffiziellen Garmin-Connector** (Sperr-Risiko, R-T11) –
  nur Datei-Export / intervals.icu.
- Weitere Datenquellen außer Garmin/Strava (Oura/intervals.icu/Apple Health) – später.
