# Open Questions, Risiken & offene Entscheidungen

> Status: Planung (Phase 0). Bitte vor Implementierung (mindestens die **Blocker**)
> beantworten. Format: jede Frage hat eine empfohlene **Default**-Antwort, damit das
> Projekt im Zweifel nicht stehen bleibt.

---

## 0. Bereits entschieden (Stand 2026-06-08)

> Diese Punkte sind durch deine Rückmeldung geklärt und in den anderen Dokumenten
> eingearbeitet.

- **E1 – Garmin ist primäre und wichtigste Quelle.** Es wird das **volle Garmin-Programm**
  benötigt: Aktivitäten, HRV, Schlaf, Ruhepuls, Stress, Body Battery, Training Readiness/
  Trainingsbereitschaft, Trainingsstatus etc. Die gesamte Coaching-Logik hängt primär an
  Garmin-Daten. Strava wird zur **sekundären/optionalen** Quelle.
- **E2 – Garmin-Anbindung:** Da das volle Datenspektrum benötigt wird und die offizielle
  Garmin-API für Private kaum zugänglich ist, wird im MVP der **inoffizielle Connector**
  genutzt (für eure eigenen Accounts, mit Einverständnis). Offizielle API bleibt als
  späterer, austauschbarer Pfad vorgesehen.
- **E3 – LLM:** **Claude (Anthropic)** als Anbieter, hinter einer Abstraktion, LLM nur für
  Erklärung/Chat (nicht für Entscheidungen), abschaltbar.
- **E4 – Hosting (präzisiert 2026-06-08):** **Kein gemieteter (kostenpflichtiger) Server.**
  Always-on-Betrieb läuft auf einem **kostenlosen Always-Free-Cloud-Tier** (Q6: Option
  „free_tier“ gewählt). Empfehlung: **Oracle Cloud Always Free** (dauerhaft kostenlose
  ARM-VM, genug für DB + Services); Alternative: Google Cloud `e2-micro` Always Free.
  Dort laufen 24/7: DB, API, Worker, Garmin-Connector, Telegram-Bot. Web-Frontend kann
  dort mitlaufen oder lokal/on demand betrieben werden.
- **E6 – Garmin-MFA:** Garmin-Account hat **2FA/MFA aktiv** → der erste Login des
  inoffiziellen Connectors muss **einmalig interaktiv** erfolgen (MFA-Code eingeben),
  danach Token-basiert (`garth`). Siehe architecture §3.4.
- **E7 – Strava:** Strava wird als **sekundäre/Fallback-Quelle** mitgenommen (zusätzlich
  zu Garmin als Primärquelle).
- **E8 – Remote-Zugriff:** Web-App soll auch von unterwegs erreichbar sein → via
  **Tailscale** (kein öffentlicher Port, keine Servermiete).

## 1. Offene Punkte / zu bestätigen (vor Phase 1)

> Q6, Q8, Q9, Strava, MFA sind durch deine Auswahl geklärt (s. §0 E4–E8). Verbleibend:

- **Q10 – Konkreter Free-Tier-Anbieter (NEU):** Welcher Always-Free-Tier? Empfehlung
  **Oracle Cloud Always Free** (ARM-VM, dauerhaft kostenlos, genug RAM/Disk für DB +
  Services). Alternativen: Google Cloud `e2-micro` Always Free (kleiner). Render/Fly.io
  Free sind für 24/7-Dauerbetrieb ungeeignet bzw. nicht mehr kostenlos.
  - **Default:** Oracle Cloud Always Free. → **Bitte bestätigen / Account vorhanden?**
- **Q11 – Wo läuft der Garmin-Connector? (wichtig, s. R-T9):** Auf dem Free-Tier
  (Datacenter-IP, höheres Sperr-/Erkennungsrisiko bei inoffiziellem Garmin-Login) oder
  besser auf einem späteren Heimgerät (Residential-IP, sicherer)?
  - **Default für Start:** auf dem Free-Tier (einfachster Betrieb), Risiko akzeptiert und
    dokumentiert; bei Problemen Garmin-Connector auf Heim-Residential-IP auslagern.
- **Q12 – Gesundheitsdaten auf Fremd-Tier (Privacy, s. R-T10):** Sensible Gesundheitsdaten
  und Garmin-Tokens liegen dann auf einem Drittanbieter (Oracle/Google). Akzeptabel?
  - **Default:** Ja für privaten Eigengebrauch, mit Verschlüsselung at rest; bewusst
    dokumentiert.

### Bereits entschieden (zur Nachverfolgung)
- **Q5 – API-Topologie:** **Eigener `apps/api`-Service** (Bot/Worker always-on im Free-Tier,
  Web on demand/Tailscale → alle nutzen dieselbe API/Core).
- **Q6 – Always-on:** kostenloser **Always-Free-Cloud-Tier** (E4).
- **Q7 – Garmin-Connector:** isolierter **Python-Service** (`garth`/`garminconnect`).
- **Q8/E6 – Garmin-Login:** **MFA aktiv** → einmaliger interaktiver Login, danach Tokens.
- **Q9/E8 – Remote-Zugriff:** **Tailscale**.

---

## 2. Technische Risiken

- **R-T1 (KRITISCH, erhöht durch E1/E2):** Garmin ist **primäre Quelle** und läuft über
  einen **inoffiziellen** Connector → die gesamte Coaching-Logik hängt an einer brüchigen,
  ToS-grenzwertigen Komponente. Bricht der Login (MFA/Captcha/Endpoint-Änderung) oder wird
  der Account gesperrt, fällt der Kernnutzen aus.
  *Mitigation:* (1) Connector strikt isoliert (eigener Service), (2) alle abgerufenen Daten
  **lokal persistent** speichern (System bleibt mit Bestandsdaten nutzbar), (3) Token-basiertes
  Login (`garth`) statt Dauer-Passwort, (4) klare Statusanzeige & Alarm bei Sync-Fehlern,
  (5) Strava als sekundärer Fallback für Aktivitäten, (6) offizielle API als austauschbarer
  Zielpfad vorbereitet. **Empfehlung:** offizielle Garmin-API parallel beantragen.
- **R-T7:** Always-on-Anforderung des Bots → gelöst über **kostenlosen Always-Free-Cloud-
  Tier** (E4). *Restrisiko:* Anbieter ändert/kündigt Free-Tier-Bedingungen. *Mitigation:*
  portables Docker-Compose-Setup → Umzug auf anderes Tier/Heimgerät jederzeit möglich.
- **R-T8:** Neustart des Free-Tier-Hosts → Bot/Sync offline. *Mitigation:* Docker
  `restart: always`, Healthcheck, systemd-Autostart.
- **R-T9 (NEU, wichtig):** Inoffizieller Garmin-Login von einer **Datacenter-IP** (Free-
  Tier) ist auffälliger als von Residential-IP → höheres Risiko für Blockade/Account-
  Sperre. *Mitigation:* Token-Login (`garth`), konservative Request-Raten/Intervalle,
  Garmin-Connector bei Problemen auf ein Heim-Residential-Gerät auslagern (Connector ist
  isoliert → einfach verschiebbar). Siehe Q11.
- **R-T10 (NEU, Privacy):** Sensible Gesundheitsdaten + Garmin-Tokens liegen auf einem
  Drittanbieter (Free-Tier). *Mitigation:* Verschlüsselung at rest, keine Klartext-
  Secrets/Logs, minimaler Personenbezug, Zugriff via Tailscale statt offener Ports.
- **R-T2:** Provider-Rate-Limits/Backfill großer Historien → langsame/abgelehnte Syncs.
  *Mitigation:* gestaffelter Backfill, Backoff, `sync_jobs`-Steuerung.
- **R-T3:** Deduplizierung Mehrfachquellen fehlerhaft → doppelte/verfälschte Last.
  *Mitigation:* eindeutige Heuristik + Tests; Quellpriorität definieren.
- **R-T4:** LLM-Kosten/Latenz/Halluzination. *Mitigation:* LLM nur für Erklärung,
  Caching, Budget-Limit, deterministische Kernlogik.
- **R-T5:** Mandantentrennungs-Bug → Datenleck zwischen Nutzern. *Mitigation:* user-scoped
  Repository-Layer, Tests, ggf. Row-Level-Security.
- **R-T6:** Token-/Secret-Leak. *Mitigation:* Verschlüsselung at rest, kein Logging,
  Secret-Store.

## 3. Fachliche Risiken (Domäne)

- **R-F1:** Recovery-/Readiness-Heuristik ist medizinisch nicht validiert → falsche
  Empfehlungen. *Mitigation:* konservative Regeln, klare Disclaimer, Erklärbarkeit,
  keine medizinischen Aussagen.
- **R-F2:** Baselines (HRV/Ruhepuls) instabil bei wenig Daten. *Mitigation:* Mindest-
  Datenmenge vor Empfehlungen, „noch nicht genug Daten“-Zustand.
- **R-F3:** Unterschiedliche Datenqualität je Quelle (z. B. HR aus Strava vs. Garmin).
  *Mitigation:* Quellpriorität, Felder als optional/nullable behandeln.
- **R-F4 (NEU, Zyklus/S1):** Zyklusbasierte Empfehlungen sind individuell und sensibel;
  Daten oft manuell/unvollständig. *Mitigation:* deterministische Phasenberechnung mit
  klaren Annahmen, konservativ, **keine medizinische Beratung**, opt-in pro Nutzer.
- **R-F5 (NEU, Ernährung/S2):** Ernährungsempfehlungen können als medizinischer Rat
  missverstanden werden; Datenbasis ohne Food-Logging begrenzt. *Mitigation:* nur grobe
  Guidance, klare Disclaimer, kein Food-Tracking in v0, Verzicht bei Vorerkrankungen-Hinweis.

## 3b. Scope-/Komplexitäts-Risiken durch erweiterten MVP (NEU)

- **R-T11 (KRITISCH, Write-back/S3):** Write-back **über den inoffiziellen Garmin-Connector**
  würde aus reinem Lesen Schreiben machen → deutlich höheres **Account-Sperr-Risiko** für
  die **primäre** Datenquelle + hohe Brüchigkeit. *Mitigation/Entscheidung:* Garmin-Write-back
  in v0 **ausgeschlossen**; stattdessen Datei-Export und/oder intervals.icu (offizielle API).
- **R-P4 (NEU):** Der MVP umfasst jetzt Garmin-Vollimport + CTL/ATL/TSB + Zyklus + Ernährung +
  Write-back → **deutlich größer** als ein „schnell brauchbares" Minimal-System. *Mitigation:*
  Zweistufiger MVP (**Core** zuerst lauffähig, dann **Extended**), s. mvp-roadmap §1/§3.
  Empfehlung: Core-Kette zuerst vollständig schließen, bevor S1–S3 ergänzt werden.

## 4. Produktbezogene Risiken

- **R-P1:** Bot und Web entwickeln doppelte Logik. *Mitigation:* gemeinsames
  `packages/core`, Bot ruft nur API/Core.
- **R-P2:** Feature-Überladung im MVP → nie fertig. *Mitigation:* strenge MVP-Definition
  (s. mvp-roadmap §3).
- **R-P3:** Rechtliches: Strava-Brand/Display-Richtlinien, DSGVO-Pflichten auch im
  Privatbetrieb (besonders bei 2. Person). *Mitigation:* Einverständnis dokumentieren,
  Richtlinien prüfen.

---

## 4a. Scope-Entscheidungen aus den Orientierungs-Reels (entschieden 2026-06-08)

> Nutzer wünscht **S1–S3 im MVP**, **S4 vorerst nicht**. Eingearbeitet mit risikoarmen,
> bewusst schlank gehaltenen v0-Definitionen (s. „Architekt-Hinweis" je Punkt).

- **S1 – Zyklus-/Phasen-Tracking → MVP.** Menstruationszyklus erfassen, Phase (Menstruation/
  Follikel/Ovulation/Luteal) ableiten, Empfehlungen daran anpassen.
  - **Architekt-Hinweis / v0-Scope:** Eingabe primär **manuell** (Periodenstart) + optional
    Garmin „Women's Health"-Daten, falls der Connector sie liefert. Phasen werden
    **deterministisch** berechnet; Empfehlungen passen Tonalität/Intensität an, **keine
    medizinischen Aussagen** (Disclaimer). Entity `menstrual_cycles` (s. data-model).
- **S2 – Ernährung → MVP.** Ernährungsempfehlungen auf Basis von Last/Zielen/Phase.
  - **Architekt-Hinweis / v0-Scope:** **Guidance statt Food-Tracking** – d. h. tägliche
    grobe Zielwerte (Kalorien/Makro-Richtung, Hydration, Timing rund ums Training) +
    Claude-Erklärung. **Kein** vollständiges Food-Logging / keine Lebensmittel-Datenbank
    (eigene Großdomäne → später). **Keine medizinische/diätetische Beratung** (Disclaimer).
    Entity `nutrition_recommendations`.
- **S3 – Workout-Write-back → MVP (eingeschränkt).** Strukturierte Workouts erzeugen und
  exportieren.
  - **Architekt-Hinweis / v0-Scope (wichtig, s. R-T11):** Write-back **NICHT** über den
    inoffiziellen Garmin-Connector (würde das Sperr-Risiko der primären Quelle massiv
    erhöhen – nur Lesen ist schon grenzwertig). Stattdessen v0:
    1) **Datei-Export** des geplanten Workouts (z. B. `.FIT`/strukturiertes Format) zum
       manuellen Import, und/oder
    2) Push an eine Plattform mit **offizieller API** (**intervals.icu**).
    Garmin-/TrainingPeaks-/Zwift-Write-back nur später und nur über offizielle Wege.
- **S4 – Weitere Quellen (Oura/intervals.icu/Apple Health) → vorerst nein.** Nur
  Garmin (primär) + Strava (sekundär). Connector-Architektur bleibt vorbereitet.
  - Hinweis: **intervals.icu** (offene API) bleibt der naheliegendste spätere Zusatz –
    und ist zugleich das empfohlene Write-back-Ziel (S3).

## 5. Offene Architekturentscheidungen

- **D1 – API-Stil:** tRPC (intern, voll typisiert) vs. REST. *Tendenz:* tRPC intern +
  REST/Webhooks für externe Integrationen.
- **D2 – ORM:** Prisma (DX) vs. Drizzle (näher an SQL, schlanker). *Tendenz:* Prisma
  für schnellen Start.
- **D3 – Queue/Scheduler:** BullMQ+Redis vs. pg-boss (nur Postgres). *Tendenz:* pg-boss,
  wenn Redis sonst nicht gebraucht wird (weniger Infra); sonst BullMQ.
- **D4 – Auth-Lösung:** Auth.js vs. Lucia vs. Managed (Supabase Auth/Clerk). *Tendenz:*
  abhängig von Hosting-Entscheidung (Q4).
- **D5 – Schlaf/HRV-Quelle im MVP:** nur falls verfügbar; sonst Recovery-Heuristik
  zunächst nur aus Aktivitätslast.
- **D6 – Rohdaten-Aufbewahrung:** wie lange `raw_imports` halten? *Tendenz:* unbegrenzt
  im Privatbetrieb, später Retention-Policy.
- **D7 – Einheiten/Locale:** metrisch + Deutsch als Default; i18n-fähig optional.

---

## 6. Konkrete Fragen an dich (als Nächstes beantworten)

> Geklärt (E1–E8): Garmin primär, inoffizieller Connector, Claude, Free-Tier-Hosting,
> MFA aktiv, Strava sekundär, Tailscale. Offen bleiben:

1. **Free-Tier-Anbieter (Q10):** Oracle Cloud Always Free ok, oder hast du eine Präferenz/
   bestehenden Account?
2. **Garmin-Connector-Standort (Q11):** Start auf dem Free-Tier akzeptiert (Datacenter-IP-
   Risiko, R-T9) oder lieber gleich ein kleines Heimgerät dafür?
3. **Gesundheitsdaten auf Fremd-Tier (Q12):** Speicherung auf Oracle/Google ok (R-T10)?
4. **Welche Sportarten stehen im Fokus** (nur Ausdauer, oder auch Kraft/andere)? *(A1)*
5. **Initialer Backfill:** Wie viel Garmin-Historie initial importieren (alles vs. letzte
   X Monate)?
6. Soll die Web-App von Beginn an mehrsprachig sein, oder reicht Deutsch? *(D7)*
7. Gibt es ein konkretes erstes Trainingsziel (z. B. Wettkampf), an dem sich der
   Coach orientieren soll – oder zunächst rein reaktive Tagesempfehlungen?
8. Soll der Partner-Account später Daten teilen können (Rollen/Sharing)?

---

## 7. Annahmen-Tracking (aus project-overview)

| ID | Annahme | Status |
|----|---------|--------|
| A1 | Fokus Ausdauersport | offen (Frage 4) |
| A2 | Hosting | **geklärt:** kostenloser Always-Free-Cloud-Tier (E4); Anbieter offen (Q10) |
| A3 | 1 Entwickler, DX wichtig | bestätigt |
| A4 | Deutsch als UI-Sprache | offen (D7) |
| A5 | Kleines/privates Budget | bestätigt (kostenloser Tier, Claude-Kosten begrenzen) |
| A6 | Garmin ist primäre Datenquelle (volles Programm) | **bestätigt (E1)** |
| A7 | LLM = Claude/Anthropic | **bestätigt (E3)** |
| A8 | Garmin-MFA aktiv → einmaliger interaktiver Login | **bestätigt (E6)** |
| A9 | Strava als sekundäre Quelle | **bestätigt (E7)** |
| A10 | Remote-Zugriff via Tailscale | **bestätigt (E8)** |
