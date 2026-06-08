# Architecture – KI-Coach-System

> Status: Planung (Phase 0). Keine Implementierung.
> Dieses Dokument bündelt: Gesamtarchitektur, Module, Datenquellen-Strategie,
> KI-Coach-Konzept, Bot-Konzept, Web-App-Konzept, Security/Privacy, Tech-Stack
> und Repo-Struktur.

---

## 1. Gesamtarchitektur

### 1.1 Leitidee

**Ein Backend-Kern, zwei dünne Oberflächen.** Telegram-Bot und Web-App sind reine
Präsentations-/Interaktionsschichten. Die gesamte Business-Logik (Import, Analyse,
Coaching) liegt im gemeinsamen Backend und wird über eine API bzw. ein gemeinsames
Domain-Package angesprochen. So gibt es **keine doppelte Logik**.

### 1.2 Architektur-Überblick (Komponenten)

```
                 ┌─────────────────┐        ┌─────────────────┐
                 │  Web-App (SPA/  │        │  Telegram-Bot   │
                 │  SSR Frontend)  │        │  (dünner Client)│
                 └────────┬────────┘        └────────┬────────┘
                          │  HTTPS/JSON               │  Bot-Updates
                          ▼                           ▼
                 ┌──────────────────────────────────────────────┐
                 │                  API / Backend                │
                 │  (Auth, REST/tRPC Endpunkte, Validierung)     │
                 └───────┬───────────────┬──────────────┬────────┘
                         │               │              │
            ┌────────────▼───┐  ┌────────▼───────┐  ┌───▼───────────────┐
            │ Domain / Core  │  │ Analyse-Engine │  │ KI-Coach /        │
            │ (Services,     │  │ (Last, Recovery│  │ Recommendation    │
            │  Use-Cases)    │  │  Trends)       │  │ Layer (Regeln+LLM)│
            └───┬────────┬───┘  └────────────────┘  └───────────────────┘
                │        │
   ┌────────────▼──┐  ┌──▼───────────────┐
   │ Connectors    │  │ Persistence      │
   │ (Strava,      │  │ (DB Repository)  │
   │  Garmin, ...) │  └──────┬───────────┘
   └──────┬────────┘         │
          │                  ▼
   ┌──────▼───────┐   ┌──────────────┐
   │ Externe APIs │   │  PostgreSQL  │
   │ Strava/Garmin│   └──────────────┘
   └──────────────┘

      ┌───────────────────────────────────────────────┐
      │  Scheduler / Worker (Background Jobs)          │
      │  Sync, Token-Refresh, nächtliche Analyse       │
      │  nutzt dieselben Domain-Services + Connectors   │
      └───────────────────────────────────────────────┘
```

### 1.3 Schichten (von außen nach innen)

1. **Edges / Clients:** Web-App, Telegram-Bot. Kennen nur die API + DTOs.
2. **API-Layer:** Authentifizierung, Request-Validierung, Mapping DTO ↔ Domain.
3. **Domain/Core (Use-Cases & Services):** Geschäftslogik, orchestriert Connectors,
   Analyse und Coach. Unabhängig von Framework/DB-Details.
4. **Analyse-Engine & KI-Coach:** Fachliche Berechnungen und Empfehlungslogik.
5. **Connectors:** Provider-spezifische Adapter hinter einheitlichem Interface.
6. **Persistence:** Repository-Schicht über PostgreSQL.
7. **Worker/Scheduler:** Asynchrone Jobs, nutzen dieselben Domain-Services.

---

## 2. Hauptmodule & Verantwortlichkeiten

| Modul | Verantwortung | Kennt NICHT |
|-------|---------------|-------------|
| **Frontend Web-App** | Darstellung, Interaktion, Charts, Onboarding | DB, Provider-APIs |
| **Telegram-Bot** | Commands, Chat-Eingang, kurze Antworten/Bilder | Business-Logik, DB |
| **API/Backend** | Auth, Routing, Validierung, DTO-Mapping | Provider-Details |
| **Domain/Core** | Use-Cases, Orchestrierung, Domänenregeln | UI, HTTP, konkrete Provider |
| **Connectors** | OAuth, Fetch, Mapping Roh→normalisiert je Provider | Analyse, UI |
| **Persistence** | Speichern/Laden, Migrations, Mandantentrennung | UI |
| **Analyse-Engine** | Trainingslast, Recovery, Trends, Aggregationen | Provider, UI |
| **KI-Coach/Recommendation** | Regeln + datenbasierte Signale + LLM-Erklärung | DB-Details |
| **Auth/User Management** | Identität, Sessions, Rollen, Telegram-Verknüpfung | Analyse |
| **Scheduler/Worker** | Zeit-/Event-gesteuerte Jobs, Retry, Backfill | UI |

### 2.1 Wie Bot und Web dieselbe Logik nutzen

- **Variante A (empfohlen für MVP): Gemeinsame API.**
  Bot und Web rufen dieselben Backend-Endpunkte auf. Der Bot ist ein eigener
  Service/Prozess, der intern die API (oder direkt die Domain-Services via geteiltem
  Package) anspricht. Vorteil: klare Grenze, Bot bleibt dünn.
- **Variante B: Geteiltes Domain-Package im Monorepo.**
  Eine `packages/core`-Bibliothek mit Use-Cases/Typen wird von API, Bot und Worker
  importiert. Empfohlen **zusätzlich** zu A, damit Typen/Logik nur einmal existieren.

> **Default-Empfehlung:** Monorepo mit `packages/core` (geteilte Domain + Typen) +
> einer HTTP-API. Bot ruft die API auf (nicht die DB direkt). Das verhindert doppelte
> Logik und hält den Bot austauschbar.

---

## 3. Datenquellen-Strategie (Garmin primär, Strava sekundär)

> **Entscheidung (E1):** **Garmin ist die primäre und wichtigste Quelle.** Benötigt wird
> das volle Programm: Aktivitäten, HRV, Schlaf, Ruhepuls, Stress, Body Battery, Training
> Readiness/Trainingsbereitschaft, Trainingsstatus. Die Coaching-Logik hängt primär an
> Garmin. **Strava ist sekundär/optional** (z. B. als Fallback für Aktivitäten).

### 3.1 Einordnung in die Architektur

Jede Quelle ist ein **Connector**, der ein gemeinsames Interface erfüllt:

```
interface SourceConnector {
  authorize(userId): AuthFlow
  refreshToken(account): Tokens
  fetchActivities(account, since): RawActivity[]
  fetchHealthMetrics(account, since): RawHealthMetric[]   // soweit verfügbar
  toNormalized(raw): NormalizedActivity | NormalizedMetric
}
```

Die Analyse-Engine und UI sehen **nur normalisierte Daten**. Provider-Eigenheiten
bleiben im Connector und in den Rohdaten-Tabellen.

### 3.2 Strava

- **Offizielle OAuth2-API**, gut dokumentiert, Webhooks vorhanden.
- **Vorteile:** Stabil, legal, klare Rate-Limits, Refresh-Tokens.
- **Einschränkungen:** Strava liefert primär Aktivitäten; Schlaf/HRV nur begrenzt.
  Manche Detaildaten (Streams) sind limitiert.
- **Wichtig:** Strava-Display-/Brand-Richtlinien beachten (Anzeige „Powered by Strava“,
  keine Weitergabe von Strava-Daten an Dritte). *(Compliance-Punkt, s. open-questions)*
- **Empfehlung:** **Primäre MVP-Quelle.** Start mit Polling + Backfill, dann Webhooks.

### 3.3 Garmin – offiziell vs. inoffiziell (klar getrennt)

#### Variante 1 – Offiziell: Garmin Health/Connect API (Partnerprogramm)

- **Vorteile:** Legal, stabil, reichhaltige Gesundheitsdaten (Schlaf, HRV, Stress,
  Body Battery, Daily Summaries), Push-basierte Auslieferung.
- **Nachteile/Risiken:** Zugang erfordert **Bewerbung/Freigabe** als Partner; für ein
  rein privates Projekt evtl. **nicht ohne Weiteres** zu bekommen; Vertrags-/
  Review-Aufwand; eventuell kommerzielle Einschränkungen.
- **Risiko:** Antrag wird abgelehnt oder dauert lange → blockiert MVP, wenn man
  davon abhängig macht.

#### Variante 2 – Inoffiziell: Garmin-Connect-Login-Scraping (z. B. python-garminconnect)

- **Vorteile:** Sofort nutzbar, sehr reichhaltige Daten, kein Partnerantrag.
- **Nachteile/Risiken:**
  - **Verstößt potenziell gegen Garmins ToS** → rechtlich/ethisch heikel.
  - **Brüchig:** Login-Flows/MFA/Captcha ändern sich, kann jederzeit brechen.
  - **Credential-Handling:** Erfordert Speicherung von Garmin-Login/Session → höheres
    Sicherheitsrisiko als reine OAuth-Tokens.
  - **Account-Sperre** möglich.
- **Einordnung:** Für **privaten Eigengebrauch** (nur du/Partnerin, eigene Accounts,
  explizites Einverständnis) als **optionaler, isolierter** Connector vertretbar –
  aber **nicht** als öffentliches/skalierendes Feature.

#### Variante 3 – Indirekt: Garmin → Strava-Sync

- Garmin kann Aktivitäten automatisch zu Strava pushen. Dann deckt der **Strava-Connector**
  einen Teil der Garmin-Aktivitätsdaten mit ab.
- **Vorteil:** Null zusätzlicher Garmin-Integrationsaufwand für Aktivitäten.
- **Nachteil:** **Keine** Garmin-spezifischen Gesundheitsdaten (Schlaf, HRV, Body Battery).

### 3.4 Empfehlung für den Start (aktualisiert nach E1/E2)

Da Garmin das volle Datenspektrum liefern muss und die **offizielle** Garmin-API für
Privatpersonen kaum zugänglich ist:

1. **MVP:** **Inoffizieller Garmin-Connector** als zentrale Quelle (Variante 2), für eure
   eigenen Accounts mit Einverständnis. Liefert Aktivitäten **und** Gesundheitsdaten
   (HRV, Schlaf, Ruhepuls, Stress, Body Battery, Readiness, Trainingsstatus).
   - **Umsetzung (Default, s. Q7):** kleiner, isolierter **Python-Service** mit
     `garth`/`garminconnect` (robusteste verfügbare Lib), der normalisierte Daten an den
     TS-Kern liefert.
   - **Login (E6 – MFA ist aktiv):** Der erste Login muss **einmalig interaktiv** erfolgen
     (z. B. ein Admin-/CLI-Schritt, bei dem der MFA-Code eingegeben wird). `garth` tauscht
     das in **OAuth-Tokens**, die danach verschlüsselt gespeichert und automatisch erneuert
     werden – **kein dauerhaftes Klartext-Passwort**. Läuft der Token ab oder wird MFA
     erneut verlangt, ist ein erneuter interaktiver Login nötig (Statusanzeige + Hinweis
     per Bot/Web).
2. **MVP optional:** **Strava (offiziell)** als sekundäre Aktivitätsquelle/Fallback.
   Kann auch ganz weggelassen werden (s. open-questions Frage 6).
3. **Parallel/Später:** **Offizielle Garmin-API** beantragen. Wird sie gewährt, ersetzt
   sie den inoffiziellen Connector ohne Architekturänderung (gleiches Interface).

> **Wichtiger Risikohinweis:** Mit Garmin als primärer Quelle über einen inoffiziellen
> Connector hängt der Kernnutzen an einer **brüchigen, ToS-grenzwertigen** Komponente
> (Login-/MFA-Änderungen, mögliche Account-Sperre). Deshalb gilt verbindlich:
> - Alle abgerufenen Garmin-Daten werden **lokal persistent** gespeichert → das System
>   bleibt mit Bestandsdaten nutzbar, auch wenn der Sync zeitweise ausfällt.
> - Sync-Fehler sind klar sichtbar (Status/Alarm), brechen aber nicht das Gesamtsystem.
> - Offizielle API parallel beantragen, um Abhängigkeit langfristig zu reduzieren.
> Details: `open-questions.md` R-T1.

### 3.5 Austauschbarkeit der Garmin-Integration

- Beide Garmin-Varianten implementieren **dasselbe** `SourceConnector`-Interface und
  liefern **dasselbe normalisierte Datenmodell**.
- Auswahl per Konfiguration/Feature-Flag pro Umgebung (`GARMIN_MODE=official|unofficial|off`).
- Analyse, KI-Coach und UI hängen **nie** an `garmin_unofficial`, sondern an
  normalisierten Daten. → Wechsel = Connector tauschen, Rest bleibt.

---

### 3.6 Write-back / Export (S3, MVP-Extended)

Neben dem **Lesen** (SourceConnector) gibt es einen getrennten, schmalen **Export-Pfad**
für erzeugte Workouts:

```
interface WorkoutExporter {
  toFile(workout): FileArtifact          // z. B. .FIT / strukturiertes Format
  pushToIntervalsIcu(account, workout)   // offizielle API
}
```

- **Bewusst getrennt** vom Import und vom inoffiziellen Garmin-Connector.
- **Garmin-Write-back ist ausgeschlossen** (R-T11): Schreiben über den inoffiziellen
  Connector würde das Sperr-Risiko der Primärquelle massiv erhöhen.
- Später (offizielle Wege): TrainingPeaks/Zwift/Garmin-Export als zusätzliche `WorkoutExporter`.

## 4. KI-Coach / Recommendation Layer

> **Leitsatz (bestätigt durch Orientierungs-Reels, s. §0 in `open-questions.md`):**
> *„The hard part isn't the prompt, it's the loop."* Der eigentliche Produktwert ist
> **nicht** ein cleverer Claude-Prompt, sondern der **dauerhafte, deterministische Zustand
> über Zeit**: longitudinale Trainingslast (CTL/ATL/TSB), Schwellen/Zonen bei
> Fitness-Änderungen neu berechnen, Verletzungen/Kontext erinnern und das LLM von
> unsinnigen Intensitäten abhalten. Genau das leistet der Kern – Claude erklärt nur.

### 4.1 Drei klar getrennte Ebenen

```
   Rohdaten/Normalisiert
          │
          ▼
   (1) Regelbasierte Logik   →  deterministische Entscheidungen & Sicherheitsleitplanken
          │
          ▼
   (2) Datenbasierte Analyse →  Metriken, Trends, Baselines, Anomalien
          │
          ▼
   (3) LLM-Erklärung         →  formuliert/erklärt, fragt nach, fasst zusammen
          │
          ▼
      Empfehlung (mit Begründung + Datenbeleg)
```

1. **Regelbasierte Logik (deterministisch):**
   - Trifft die eigentliche Empfehlung (z. B. „Heute Ruhe/leicht/intensiv“).
   - Sicherheitsleitplanken (z. B. bei mehreren Tagen niedriger HRV → keine harte Einheit).
   - Vollständig nachvollziehbar/testbar.
2. **Datenbasierte Analyse (der „Loop"):**
   - **Longitudinale Trainingslast** nach etabliertem Modell: **CTL** (chronisch, ~Fitness),
     **ATL** (akut, ~Ermüdung), **TSB = CTL − ATL** (Form/Frische). Wird **persistent**
     fortgeschrieben, nicht pro Anfrage neu „geraten".
   - **Schwellen/Zonen-Management:** FTP, Schwellen-HR/-Pace, max. HR und daraus abgeleitete
     Zonen werden **versioniert** geführt; ändert sich die Fitness, werden Zonen neu berechnet
     (s. Entity `training_thresholds` in `data-model.md`).
   - **Kontext-Gedächtnis:** Verletzungen/Krankheit/Pausen (Entity `health_events`) fließen
     als Leitplanken ein.
   - HRV-Trend vs. persönliche Baseline, Schlafqualität, Ruhepuls-Abweichung.
   - Später optional einfache statistische Modelle/Trends.
3. **LLM-gestützte Erklärung (Anbieter: Claude / Anthropic, s. E3):**
   - **Erklärt** die bereits getroffene, regelbasierte Entscheidung in natürlicher
     Sprache, beantwortet Rückfragen, fasst den Tag zusammen.
   - Bekommt **strukturierte** Eingaben (die berechneten Metriken + die Regel-Entscheidung),
     nicht die Rohdaten-Flut.
   - Hinter einer Anbieter-Abstraktion (austauschbar), **abschaltbar** – das System
     funktioniert auch ohne LLM (dann nur strukturierte Begründung statt Fließtext).
   - **Datenminimierung:** nur die nötigen, möglichst pseudonymisierten Werte an Claude
     senden; keine direkten Identifikatoren. Kostenkontrolle via Caching/Budget-Limit.

### 4.2 Was NICHT blind dem LLM überlassen wird

- Die **eigentliche Trainingsentscheidung** (Intensität, Belastung) → regelbasiert.
- **Sicherheitsrelevante** Hinweise (z. B. Übertraining, Krankheitssignale).
- **Numerische Berechnungen** (CTL/ATL/TSB, Zonen, Trends) → deterministisch berechnen,
  nicht „raten“.
- **Schutz vor „dummen Intensitäten":** Vorschläge werden gegen Zonen, TSB und
  `health_events` validiert, bevor sie ausgegeben werden – auch wenn ein LLM-Vorschlag
  beteiligt ist.
- Das LLM **erklärt und kommuniziert**, es **entscheidet** nicht.

### 4.2a Zusätzliche Empfehlungsdimensionen (MVP-Extended)

- **Zyklusbewusst (S1):** Ist Zyklus-Tracking aktiviert (opt-in), fließt die deterministisch
  berechnete Phase als **zusätzliches Signal/Regel** in die Empfehlung ein (z. B. Tonalität,
  Intensitäts-Hinweise). Kein medizinischer Rat; immer mit Disclaimer.
- **Ernährungs-Guidance (S2):** Aus Last/Zielen/Phase werden **grobe** Tagesrichtwerte
  abgeleitet (Regeln), die Claude erklärt. Kein Food-Logging; Disclaimer.
- **Workout-Erzeugung + Write-back (S3):** Regelbasiert/parametrisch erzeugte, gegen Zonen
  und `health_events` validierte Workouts. Ausgabe als **Datei-Export** oder Push an
  **intervals.icu** (offizielle API). **Niemals** Write-back über den inoffiziellen
  Garmin-Connector (R-T11) – das würde die kritische Primärquelle gefährden.

### 4.3 Nachvollziehbarkeit (Explainability)

Jede Empfehlung (`recommendations`) speichert:
- die ausgelösten Regeln/Schwellen,
- die zugrunde liegenden Metriken (mit Werten + Baseline),
- die Eingaben, die ans LLM gingen,
- den generierten Erklärungstext.

→ UI/Bot zeigen „**Warum?**“: konkrete Datenpunkte statt Blackbox.

---

## 5. Telegram-Bot-Konzept

### 5.1 Rolle im Gesamtsystem

Leichte, schnelle **Oberfläche** für unterwegs: kurze Abfragen, Tageszusammenfassung,
einfache Visualisierung, Chat. **Keine Business-Logik**, ruft die API auf.

### 5.2 MVP-Funktionen

- `/start` + Account-Verknüpfung (Deep-Link/Token).
- `/today` – Status & Empfehlung des Tages (mit „Warum?“).
- `/last` – letzte Aktivität(en) kurz.
- `/sync` – manuellen Sync anstoßen, Status melden.
- `/help` – Befehlsübersicht.

### 5.3 Gehört eher in die Web-App (nicht in den Bot)

- Tiefe Verlaufsanalysen, große Charts, Vergleichszeiträume.
- Trainingsplanung/Kalender.
- Account-/Datenschutz-Einstellungen, Datenexport/-löschung.
- Connector-Verwaltung (außer einfacher Start der OAuth-Verknüpfung).

### 5.4 Vorgeschlagene Chat-/Command-Struktur

- **Commands** für strukturierte, schnelle Aktionen (`/today`, `/last`, `/sync`).
- **Freitext** → KI-Coach-Chat (V1), Kontext = Nutzer-ID + aktuelle Metriken.
- **Inline-Buttons** für Drilldown („Details“, „Warum?“, „Woche zeigen“).
- Antworten kurz halten; bei Bedarf Deep-Link in die Web-App.

### 5.5 Prinzip „dünner Bot“

- Bot-Prozess validiert Eingaben, mappt auf API-Calls, formatiert Antworten.
- Keine DB-Zugriffe, keine Analyse im Bot.
- Bot ist austauschbar (theoretisch durch andere Messenger ersetzbar).

---

## 6. Web-App-Konzept

### 6.1 Wichtigste Bereiche/Screens

| Screen | Zweck | Priorität |
|--------|-------|-----------|
| Onboarding / Connect | Registrierung, Strava verbinden | MVP |
| Dashboard (Today) | Status heute, Empfehlung + „Warum?“, Wochen-Snapshot | MVP |
| Aktivitätsliste | Liste aller importierten Aktivitäten, Filter | MVP |
| Aktivitätsdetail | Einzelaktivität mit Kennzahlen | MVP |
| Verlauf/Trends | Wochenvolumen, Last, einfache Trends, Zeitraumwahl | V1 |
| Recovery/Readiness | Schlaf/HRV/Ruhepuls, Readiness-Verlauf | V1 |
| Coach-Chat | Chat mit KI-Coach, Verlauf | V1 |
| Zyklus (opt-in) | Periodeneingabe, Phase, phasenbewusste Hinweise | MVP-Ext |
| Ernährung | Tages-Guidance (grobe Richtwerte, Timing) | MVP-Ext |
| Workout-Export | erzeugtes Workout exportieren / zu intervals.icu pushen | MVP-Ext |
| Einstellungen/Privacy | Connectors, Datenexport, Account löschen | V1 |
| Trainingsplanung | Plan/Kalender, Soll/Ist | Later |
| Reports/Drilldowns | tiefere Analysen, Vergleiche, Export | Later |

### 6.2 MVP-Priorisierung

Zuerst: **Onboarding → Dashboard → Aktivitätsliste/-detail.** Das beweist die Kette
Import → Normalisierung → Analyse → Anzeige.

### 6.3 Wirklich wertvolle Ansichten für einen persönlichen Coach

- **Dashboard „Today“** mit klarer Empfehlung + Begründung (Kernnutzen).
- **Recovery/Readiness-Trend** (Belastung vs. Erholung über Zeit).
- **Belastungsbilanz** (akut vs. chronisch) als einfache, verständliche Visualisierung.

### 6.4 Sinnvolle Dashboards & Drilldowns

- Dashboard → Klick auf Empfehlung → „Warum?“ (Metriken/Regeln).
- Wochenlast-Chart → Klick auf Tag → Aktivitäten des Tages.
- Recovery-Trend → Klick auf Tag → Schlaf/HRV-Detail.

---

## 7. Sicherheits- & Datenschutzkonzept

### 7.1 Sensible Daten (Klassifizierung)

- **Sehr sensibel:** Gesundheitsdaten (HRV, Schlaf, Ruhepuls, Readiness) – DSGVO Art. 9.
- **Sensibel/Geheim:** OAuth-Tokens, (inoffiziell) Garmin-Credentials/Sessions.
- **Privat:** Chatverläufe, Empfehlungen, Profil.
- **Intern:** Sync-Logs, technische Metadaten.

### 7.2 Schutzmaßnahmen

- **Tokens/Credentials:** verschlüsselt at rest (z. B. App-seitige Verschlüsselung mit
  Key aus Secret-Store), nie im Klartext loggen, nie an Client ausliefern.
- **Gesundheitsdaten:** jede Query user-scoped; Zugriff strikt auf Eigentümer begrenzt.
- **Chatdaten:** privat; klar definieren, **welche** Daten an externe LLMs gehen
  (Datenminimierung, ggf. Pseudonymisierung der Nutzer-ID). Option: LLM-Verzicht/lokaler
  Modus konfigurierbar.
- **Transport:** durchgehend TLS. **Secrets:** nur via Env/Secret-Store.
- **Telegram-Besonderheit:** Bot-Token schützen; Telegram-Inhalte laufen über Telegram-
  Server → keine hochsensiblen Rohdaten in den Chat schreiben, nur Zusammenfassungen.

### 7.3 Rollen & Zugriff

- **user:** Zugriff nur auf eigene Daten.
- **admin:** Betrieb/Wartung (Job-Status, keine Klartext-Tokens).
- **(Later) shared/partner:** kontrollierte Freigabe einzelner Daten an Partner/Coach.
- Prinzip: **Least Privilege**, Default „deny“, explizite Freigaben.

### 7.4 Wichtigste Risiken

- **Privat (jetzt):** Token-Leak, fehlende Verschlüsselung, versehentliches Loggen
  sensibler Daten, unsichere LLM-Weitergabe, inoffizieller Garmin-Connector (ToS/Sperre).
- **Bei Skalierung:** Mandantentrennungs-Bugs (Datenleck zwischen Nutzern), fehlendes
  Rate-Limiting, DSGVO-Pflichten (Auskunft/Löschung/AVV mit LLM-Anbieter), Audit-Lücken.

---

## 8. Deployment- & Betriebstopologie (kostenloser Always-Free-Cloud-Tier)

> **Entscheidungen (E4/E8):** Kein **kostenpflichtiger** Server. Always-on-Betrieb auf
> einem **kostenlosen Always-Free-Cloud-Tier** (Empfehlung **Oracle Cloud Always Free**),
> Zugriff/Remote über **Tailscale**. Der Telegram-Bot läuft dort 24/7 und ist damit
> dauerhaft erreichbar.

### 8.1 Schlüsselidee: „always-on“ vs. „on demand“ trennen

| Zone | Komponenten | Wo | Verfügbarkeit |
|------|-------------|----|----|
| **Always-on** | Postgres, API/Core, Worker/Scheduler, **Telegram-Bot**, Garmin-Connector | Free-Tier-VM | 24/7 |
| **On demand** | Web-Frontend | Free-Tier **oder** lokal | bei Bedarf |

**Bot ohne offenen Port:** Der Telegram-Bot nutzt **Long-Polling** (ausgehende Verbindung
zu Telegram) → kein eingehender Port, keine Webhook-URL nötig. Funktioniert auf der
Free-Tier-VM ohne zusätzliche Netzwerkkonfiguration.

### 8.2 Empfohlenes Setup

```
┌──────────────── Kostenloser Always-Free-Cloud-Tier ─────────────────┐
│  (z. B. Oracle Cloud Always Free ARM-VM)                             │
│                                                                      │
│   Docker Compose (restart: always + Healthchecks):                   │
│   ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐    │
│   │ Postgres │  │  API/Core│  │  Worker / │  │ Telegram-Bot     │    │
│   │ (verschl.│  │          │  │  Scheduler│  │ (Long-Polling)   │    │
│   │  Secrets)│  │          │  │           │  │                  │    │
│   └──────────┘  └──────────┘  └─────┬─────┘  └──────────────────┘    │
│                                     │                                │
│                              ┌──────▼───────────┐                    │
│                              │ Garmin-Connector │ (Python, isoliert) │
│                              │  garth/garminc.  │   ⚠ Datacenter-IP  │
│                              └──────────────────┘                    │
│   Tailscale (kein offener Port; sicherer Zugriff)                    │
└──────────────────────────────────────────────────────────────────────┘
            ▲                                   │ ausgehend → Telegram, Garmin, Claude, Strava
            │ Tailscale (überall erreichbar)    ▼
   ┌────────┴─────────┐                  Internet
   │  Web-Frontend    │  ← lokal/on demand ODER ebenfalls auf der VM
   └──────────────────┘
```

- **Garmin-Sync** läuft als geplanter Job (nächtlich + manuell per Bot `/sync`). Daten
  landen in Postgres → bleiben verfügbar, auch wenn Garmin zeitweise nicht erreichbar ist.
- **Remote-Zugriff (E8):** Web-App und Admin-Zugriff laufen über **Tailscale** – kein
  öffentlich offener Port, kein Reverse-Proxy mit Public-Exposure nötig.
- **Robustheit:** Docker `restart: always` + Healthchecks + systemd-Autostart (R-T8).

### 8.3 Wichtige Risiken dieser Topologie (s. open-questions)

- **R-T9 – Datacenter-IP für inoffiziellen Garmin-Login:** Garmin-Logins von Cloud-IPs
  sind auffälliger → höheres Sperr-/Erkennungsrisiko. *Mitigation:* Token-Login (`garth`),
  konservative Sync-Intervalle, keine aggressive Frequenz. **Eskalationspfad:** Da der
  Garmin-Connector ein isolierter Service ist, kann er später auf ein **Heimgerät mit
  Residential-IP** ausgelagert werden, das nur Daten in die Cloud-DB schreibt – ohne
  Änderung am restlichen System.
- **R-T10 – Gesundheitsdaten auf Drittanbieter:** Daten/Tokens liegen auf der Free-Tier-VM.
  *Mitigation:* Verschlüsselung at rest, keine Klartext-Secrets/Logs, Zugriff nur via
  Tailscale, minimaler Personenbezug.

### 8.4 Lokale Entwicklung

`docker compose up` startet Postgres, API, Worker, Bot und den Garmin-Connector lokal.
Dasselbe Compose-Setup wird auf die Free-Tier-VM ausgerollt → minimale Differenz zwischen
Dev und Betrieb. Der Stack ist **portabel**: Wechsel des Free-Tiers oder Umzug auf ein
Heimgerät ist jederzeit möglich (R-T7).

## 9. Tech-Stack-Empfehlung

> Default-Empfehlung: **TypeScript als Hauptsprache** (Web, Bot, API, Worker, geteilte
> Domain) **+ ein kleiner Python-Service nur für den Garmin-Connector** (robusteste
> inoffizielle Lib). Maximiert Code-Sharing und DX, akzeptiert Python genau dort, wo es
> den klaren technischen Vorteil bringt.

| Bereich | Empfehlung | Begründung | Alternativen (Pro/Contra) |
|---------|-----------|------------|---------------------------|
| **Hauptsprache** | TypeScript | Ein Typsystem, geteilte Domain, top DX | reines Python (würde Web/Bot-DX verschlechtern) |
| **Garmin-Connector** | **Python-Service** (`garth` + `garminconnect`) | Robusteste inoffizielle Garmin-Lib; Garmin ist kritisch (E1) | Node `garmin-connect` (weniger gepflegt, riskanter für Kernquelle) |
| **Web-Frontend** | Next.js (React) | SSR+SPA, großes Ökosystem | SvelteKit (schlank, kleinere Community) |
| **API/Backend** | Eigener API-Service (NestJS **oder** Fastify, TS) | Bot+Worker (always-on) und Web (on demand) teilen dieselbe API | Next.js Route Handlers (an Web gekoppelt – hier wegen Topologie ungünstig) |
| **API-Stil** | tRPC (intern) + REST/Webhooks (extern) | tRPC = End-to-End-Typen Web↔Backend | reines REST (mehr Boilerplate) |
| **Telegram-Bot** | grammY (TS), **Long-Polling** | Moderne Lib; Long-Polling = kein offener Port (passt zu lokalem Hosting) | Telegraf (älter); Webhooks (bräuchten öffentliche URL → unerwünscht) |
| **DB** | PostgreSQL (lokal in Docker) | Robust, relational, JSONB für Rohdaten | SQLite (zu klein für Multi-User/Jobs) |
| **ORM/Query** | Prisma (oder Drizzle) | Typsicher, Migrations, gute DX | Drizzle (näher an SQL, schlanker) |
| **Jobs/Queue** | **pg-boss** (nur Postgres) | Keine extra Infra nötig – ideal für schlankes lokales Always-on-Gerät | BullMQ+Redis (mächtiger, aber Redis als Zusatzdienst) |
| **Auth** | Lucia oder Auth.js (selbst-gehostet) | Läuft lokal ohne Managed-Dienst | Managed (Clerk/Supabase) – widerspricht „kein Server/lokal“ |
| **LLM** | **Claude (Anthropic)** über Abstraktion (z. B. Vercel AI SDK / Anthropic SDK) | Festgelegt (E3); abschaltbar, Kostenkontrolle | andere Anbieter (nur als Fallback hinter Abstraktion) |
| **Charts** | Recharts / Visx (Web), serverseitig gerenderte PNGs für Bot | Web interaktiv; Bot braucht statische Bilder | — |
| **Hosting** | **Kostenloser Always-Free-Cloud-Tier** (Oracle Cloud Always Free), Docker Compose; Zugriff via **Tailscale** | Kein kostenpflichtiger Server (E4); 24/7 → Bot immer erreichbar; kein offener Port | Heimgerät (Pi/NAS) als Alternative/Eskalation für Garmin-Residential-IP |
| **Container/Dev** | Docker Compose | Ein-Befehl-Setup, gleiche Definition für Dev & Betrieb | — |

> **Sprachgrenze bewusst:** Python wird **nur** für den Garmin-Connector eingesetzt, der
> über eine schmale interne Schnittstelle (interne HTTP-API oder direkt in die DB
> schreibend) normalisierte Daten liefert. Der TS-Kern bleibt davon entkoppelt – wird die
> offizielle Garmin-API später nutzbar, kann der Python-Service entfallen.

---

## 10. Repo- & Ordnerstruktur

### 9.1 Monorepo vs. Polyrepo

**Empfehlung: Monorepo.** Begründung:
- 1 Entwickler, eng gekoppelte Teile, viel geteilte Domain/Typen.
- Atomare Änderungen über Bot/Web/API/Worker hinweg.
- Einheitliches Tooling (Lint, Test, Types) an einer Stelle.
- Polyrepo lohnt erst bei mehreren Teams/unabhängigen Release-Zyklen.

Werkzeug: **pnpm Workspaces** (+ optional Turborepo für Caching/Builds).

### 9.2 Vorgeschlagene Struktur

```
trainings-ki/
├─ apps/
│  ├─ web/                 # Next.js Web-App (Frontend, on demand)
│  ├─ api/                 # API-Service (TS): Auth, REST/tRPC, von Web+Bot genutzt
│  ├─ bot/                 # Telegram-Bot (grammY, Long-Polling), dünner Client
│  └─ worker/              # Background-Jobs (pg-boss Worker, Scheduler)
├─ services/
│  └─ garmin-connector/    # Python-Service (garth/garminconnect), isolierter Garmin-Connector
├─ packages/
│  ├─ core/                # Domain/Use-Cases, Coaching-Regeln, Typen (framework-frei)
│  ├─ analysis/            # Analyse-Engine (Last, Recovery, Readiness, Trends)
│  ├─ connectors/          # SourceConnector-Interface + strava/, garmin/ (TS-Client zum Python-Service), garmin-official/ (später)
│  ├─ db/                  # Prisma/Drizzle Schema, Migrations, Repositories
│  ├─ ai/                  # Claude-Abstraktion, Prompt-Bausteine, Explainability
│  └─ config/              # geteilte Config, Env-Validierung, Logger
├─ docs/                   # Planungsdokumente (dieses Verzeichnis)
├─ docker-compose.yml      # lokale/always-on Infra (Postgres, API, Bot, Worker, garmin-connector)
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json              # optional
```

### 10.3 Wo liegt was?

- **Gemeinsame Domain-Logik:** `packages/core` (+ `analysis`, `ai`). Wird von `api`,
  `bot` und `worker` genutzt → keine Duplizierung.
- **Telegram-Bot:** `apps/bot` (nur UI/Commands, Long-Polling, ruft `apps/api`).
- **Web-App:** `apps/web` (reines Frontend, on demand; ruft `apps/api`).
- **API:** `apps/api` als **eigener Service** (geänderte Entscheidung Q5), läuft auf dem
  Always-on-Gerät zusammen mit Bot & Worker.
- **Worker:** `apps/worker` (Garmin-/Strava-Sync, Token-Refresh, nächtliche Analyse).
- **Garmin-Connector:** `services/garmin-connector` (Python), isoliert; `packages/connectors/garmin`
  ist der TS-Client, der ihn anspricht und normalisierte Daten weitergibt.
- **Connectors:** `packages/connectors`, je Provider hinter dem gemeinsamen Interface.

> **Always-on vs. on demand (s. §8):** `apps/api`, `apps/bot`, `apps/worker`,
> `services/garmin-connector` und Postgres laufen 24/7 auf dem Free-Tier; `apps/web`
> startest du bei Bedarf (lokal oder ebenfalls auf der VM).

---

## 11. Wichtige Architektur-Defaults (Zusammenfassung, aktualisiert)

1. Monorepo, TypeScript als Hauptsprache + isolierter Python-Service nur für Garmin.
2. Ein Backend-Kern (`apps/api` + `packages/core`); Bot & Web sind dünn und rufen die API.
3. Connectors hinter `SourceConnector`-Interface; Rohdaten + normalisierte Daten getrennt.
4. **Garmin ist primäre Quelle** (volles Programm) über inoffiziellen Connector; Strava
   sekundär/optional; offizielle Garmin-API als späterer, austauschbarer Pfad.
5. KI-Coach: Regeln entscheiden, Analyse liefert Signale, **Claude** erklärt. Alles erklärbar.
6. Security/Privacy by Design: Tokens verschlüsselt, user-scoped Queries, Datenminimierung
   gegenüber Claude.
7. **Hosting auf kostenlosem Always-Free-Cloud-Tier** (kein kostenpflichtiger Server);
   Bot via Long-Polling 24/7 erreichbar; Zugriff via Tailscale; alle Garmin-Daten
   persistent (Resilienz gegen Sync-Ausfall). Garmin-Connector bei IP-Problemen auf
   Heim-Residential-IP auslagerbar.
