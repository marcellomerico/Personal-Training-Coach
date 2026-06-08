# Project Overview – Persönliches KI-Coach-System für Sport & Gesundheit

> Status: Planungsphase (Phase 0). Dieses Dokument enthält **keine** Implementierung.
> Sprache: Deutsch. Code-Bezeichner und Tabellennamen bewusst auf Englisch.

## 1. Zusammenfassung in eigenen Worten

Wir bauen ein **persönliches KI-Coach-System für Ausdauersport und Gesundheit**.
Das System sammelt automatisch Trainings- und Gesundheitsdaten aus externen Quellen
(zuerst Strava und Garmin), normalisiert sie, analysiert Belastung/Erholung und gibt
daraus **nachvollziehbare** Trainings- und Erholungsempfehlungen.

Es gibt zwei Oberflächen auf **einem gemeinsamen Backend-Kern**:

1. **Telegram-Bot** – leichte, schnelle Oberfläche für Chat, kurze Rückfragen,
   Tageszusammenfassungen und einfache Visualisierungen. Keine eigene Business-Logik.
2. **Web-App** – das eigentliche Hauptprodukt für tiefe Analyse, Trainingsplanung,
   Erholungsanalyse, Verlauf, Dashboards und einen intelligenteren KI-Trainer.

Das System ist von Beginn an **Multi-User-fähig** gedacht (Start: 2 private Nutzer),
mit strikter Trennung von Accounts, Tokens, Daten und Berechtigungen.

## 2. Kernprobleme, die das System lösen soll

1. **Datensilos auflösen:** Trainings- und Gesundheitsdaten liegen verteilt bei
   Strava, Garmin etc. Es fehlt eine einheitliche, normalisierte Sicht über die Zeit.
2. **Belastung vs. Erholung verständlich machen:** Rohdaten (HRV, Schlaf, Puls,
   Trainingslast) sind für Laien schwer zu interpretieren. Das System soll daraus
   konkrete, verständliche Hinweise ableiten.
3. **Personalisierte, nachvollziehbare Empfehlungen:** Nicht „die App sagt X“,
   sondern „X, **weil** deine HRV 3 Tage unter Baseline liegt und die Trainingslast
   stark gestiegen ist“.
4. **Niedrige Interaktionsschwelle:** Eine schnelle Tagesfrage soll im Telegram-Bot
   in Sekunden beantwortet werden, ohne eine App öffnen zu müssen.
5. **Vertrauenswürdiger Umgang mit sensiblen Daten:** Gesundheitsdaten und OAuth-Tokens
   müssen sicher gespeichert und pro Nutzer streng getrennt werden.

## 3. Zielbild, MVP und Ausbaustufen

### 3.1 Zielbild (Langfristige Vision)

- Web-App ist das **zentrale Produkt** mit einem intelligenten KI-Trainer.
- Mehrere Datenquellen (Strava, Garmin, Apple Health, Health Connect, manuell).
- Periodisierte Trainingsplanung, adaptive Anpassung an Erholung und Lebenskontext.
- Erklärbare KI-Insights mit Verlauf und Begründungen.
- Architektur trägt auch bei wachsender Nutzerzahl (10er–100er Bereich) ohne Neubau.
- *Nicht* Ziel (bewusst): kommerzielles SaaS mit Millionen Nutzern. Architektur soll
  aber nicht in eine Sackgasse laufen.

### 3.2 MVP (für 2 private Nutzer)

Fokus: **schnell ein brauchbares System**, das echten Mehrwert liefert.

- Login/Account-System (Multi-User von Anfang an).
- Verbindung **Garmin als primäre Quelle** (volles Programm: Aktivitäten, HRV, Schlaf,
  Ruhepuls, Stress, Body Battery, Training Readiness/Trainingsbereitschaft,
  Trainingsstatus) über einen isolierten inoffiziellen Connector.
- **Strava sekundär/optional** als Fallback für Aktivitäten.
- Automatischer Import + Normalisierung; alle Garmin-Daten lokal persistent.
- Einfache Analyse (Trainingslast, Wochenvolumen, Recovery/Readiness-Heuristik).
- Telegram-Bot: Account-Verknüpfung, Tageszusammenfassung, einfache Abfragen,
  **dauerhaft erreichbar** (Long-Polling, 24/7 auf dem Free-Tier).
- Web-App: Dashboard, Aktivitätsliste, Verlauf, einfache Charts (on demand lokal).
- KI-Coach v0: regelbasierte Empfehlungen (CTL/ATL/TSB + Readiness) + **Claude**-Erklärung.

**MVP-Extended (im MVP-Ziel, nach dem Core):** Schwellen/Zonen-Management,
Verletzungs-Gedächtnis, **Zyklus-Tracking** (opt-in), **Ernährungs-Guidance v0** und
**Workout-Export/Write-back** (Datei/intervals.icu – nicht über Garmin). Aufteilung Core ↔
Extended und Begründung: `mvp-roadmap.md` §3.

> **Garmin im MVP (Entscheidung E1/E2):** Garmin ist die wichtigste Quelle; die gesamte
> Coaching-Logik hängt primär an Garmin. Da die offizielle API für Private kaum zugänglich
> ist, wird im MVP der inoffizielle Connector genutzt (eigene Accounts, mit Einverständnis),
> isoliert und später durch die offizielle API austauschbar. Details und Risiken:
> `architecture.md` §3 und `open-questions.md` R-T1.

### 3.3 Spätere Ausbaustufen

- Garmin offizielle Anbindung (sofern API-Zugang gewährt) / Wearable-Tiefe.
- Weitere Quellen: Apple Health, Health Connect, manuelle Einträge.
- Adaptive Trainingsplanung mit Periodisierung.
- Erweiterter KI-Coach (datengetriebene Modelle, Trend-Erkennung, Zielmanagement).
- Reichere Web-Dashboards, Drilldowns, Vergleichszeiträume.
- Optionale Mehr-Nutzer-Features (z. B. geteilte Pläne, Coach-Rolle).

## 3.4 Orientierung / Referenzen (vom Nutzer geteilt)

Zwei Instagram-Reels dienen als Orientierung und bestätigen die Richtung:

- **Reel 1 (`its.mikareyes`, „Claude is now my Health Coach"):** Strava + Oura + Apple
  Health → Claude als Health-Coach; ein Ort für alle Metriken; individuelle Workout-/
  Fitness-/Ernährungspläne; Beispiele: Zyklus-/Phasen-Tracking, „schlecht geschlafen →
  leichterer Tag". → Bestätigt Claude-Coach, Multi-Source, Recovery-aware. Bringt mögliche
  neue Bausteine: **Zyklus-Tracking** und **Ernährung** (Scope-Entscheidung offen).
- **Reel 2 (`thomas.lentine`, AI-Trainingsanalyse Radsport):** Claude/GPT analysiert
  Garmin/TrainingPeaks-Daten, schreibt Workouts zurück (TrainingPeaks/intervals.icu/Zwift).
  Zentrale Lektion aus den Kommentaren: *„The hard part isn't the prompt, it's the loop"* –
  longitudinales **TSB/CTL/ATL**, Zonen bei FTP-Shift neu berechnen, Verletzungen merken,
  LLM von „dummen Intensitäten" abhalten = **das ist das Produkt**. Außerdem: „Garmin ohne
  API" ist ein bekanntes Problem; **Datenqualität** entscheidet über die Empfehlungsqualität.

> Eingearbeitet: longitudinales Lastmodell (CTL/ATL/TSB), Zonen-/Schwellen-Management,
> Kontext-Gedächtnis (Verletzungen), Datenqualitäts-Checks. Noch zu entscheiden: Zyklus-
> Tracking, Ernährung, Workout-Write-back, weitere Quellen (Oura/intervals.icu) – s.
> `open-questions.md`.

## 4. Leitprinzipien für die Planung

- **Ein Backend-Kern, zwei dünne Oberflächen.** Bot und Web teilen sich dieselbe
  Domain- und Service-Logik über eine gemeinsame API.
- **Connectors hinter Interfaces.** Jede Datenquelle ist austauschbar.
- **Provider-Rohdaten vs. normalisierte Daten klar trennen.**
- **Privacy & Security by Design**, nicht nachträglich.
- **Klein starten, sauber bauen.** Keine verfrühte Skalierungs-Komplexität, aber
  auch keine Architektur-Sackgassen.

## 5. Explizite Annahmen (zu bestätigen)

> Diese Annahmen sind **keine** stillen Entscheidungen, sondern offen markiert.
> Details/Fragen in `open-questions.md`.

- **A1:** Primärer Sport = Ausdauer (Laufen/Radfahren/Schwimmen). Kraft/Team-Sport
  ist sekundär. *(zu bestätigen)*
- **A3:** Entwicklung erfolgt primär durch dich (1 Entwickler), daher zählt
  Developer Experience und Wartbarkeit stark.
- **A4:** Deutschsprachige Nutzeroberfläche, aber i18n-fähig bauen ist optional.

### Bestätigte Entscheidungen (Stand 2026-06-08)

- **E1:** **Garmin ist primäre Quelle** (volles Programm). Strava sekundär/optional.
- **E2:** Garmin-Anbindung im MVP über **inoffiziellen Connector** (eigene Accounts).
- **E3:** **Claude (Anthropic)** als LLM, nur für Erklärung/Chat, abschaltbar.
- **E4:** **Kein kostenpflichtiger Server** → Always-on-Betrieb auf einem **kostenlosen
  Always-Free-Cloud-Tier** (Empfehlung Oracle Cloud Always Free). Telegram-Bot dauerhaft
  erreichbar (Long-Polling, 24/7).
- **E5:** Budget privat/klein → kostenloser Tier; Claude-Kosten begrenzen.
- **E6:** Garmin-Account hat **MFA aktiv** → einmaliger interaktiver Login, danach Tokens.
- **E7:** **Strava** wird als **sekundäre** Aktivitätsquelle mitgenommen.
- **E8:** Remote-Zugriff auf die Web-App via **Tailscale** (kein offener Port).

> **Neue Risiken durch Free-Tier (s. `open-questions.md`):** inoffizieller Garmin-Login
> über Datacenter-IP (R-T9) und Gesundheitsdaten auf Drittanbieter (R-T10). Beide sind
> dokumentiert und mit Mitigation/Eskalationspfad versehen.
