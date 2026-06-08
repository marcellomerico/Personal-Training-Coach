# Data Model – Konzeptionelles Datenmodell

> Status: Planung (Phase 0). Konzeptionell, **kein** finales DB-Schema.
> Ziel: Entities, Zweck, wichtigste Felder, Beziehungen und die Trennung von
> provider-spezifischen vs. normalisierten Daten.

---

## 1. Grundprinzipien

1. **Mandantentrennung:** Nahezu jede Tabelle hat `user_id`. Alle Queries sind
   user-scoped.
2. **Roh vs. normalisiert:** Provider liefern unterschiedliche Formate. Wir speichern
   **Rohdaten** (z. B. `raw_activity_imports` / JSONB) **und** ein **normalisiertes**
   Modell (`activities`, `daily_health_metrics`, ...), auf dem Analyse/UI arbeiten.
3. **Provenienz:** Jeder normalisierte Datensatz weiß, aus welchem `provider_account`
   und welcher Quelle er stammt (`source`, `source_external_id`).
4. **Idempotenz:** `(source, source_external_id)` ist eindeutig je Nutzer → kein
   Duplizieren bei erneutem Sync.
5. **Soft-Delete & DSGVO:** Account-Löschung kaskadiert über `user_id`.

---

## 2. Übersicht der Beziehungen (ER, vereinfacht)

```
users 1───1 user_profiles
users 1───* provider_accounts
users 1───* activities
users 1───* daily_health_metrics
users 1───* sleep_records
users 1───* readiness_metrics
users 1───* training_plans 1───* workouts
users 1───* recommendations
users 1───* chat_sessions 1───* messages
users 1───* sync_jobs
users 1───* ai_insights
users 1───* training_thresholds          (versioniert)
users 1───* health_events                (Verletzungen/Krankheit)
users 1───* menstrual_cycles             (opt-in, S1)
users 1───* nutrition_recommendations    (S2)

provider_accounts 1───* activities            (source)
provider_accounts 1───* daily_health_metrics   (source)
provider_accounts 1───* sync_jobs
activities *───? workouts                       (Soll/Ist-Verknüpfung, optional)
recommendations ?───* activities/metrics        (Belege via ai_insights/refs)
```

> `*` = viele, `1` = eins, `?` = optional.

---

## 3. Entities im Detail

### 3.1 `users`
- **Zweck:** Zentrale Identität.
- **Felder:** `id`, `email` (unique), `password_hash` *(oder externer Auth-Provider)*,
  `role` (`user`/`admin`), `telegram_user_id` (nullable, unique), `created_at`,
  `status` (`active`/`disabled`), `deleted_at` (nullable).
- **Beziehungen:** 1:1 `user_profiles`, 1:N zu fast allem.
- **Normalisiert.**

### 3.2 `user_profiles`
- **Zweck:** Persönliche/sportliche Stammdaten & Präferenzen.
- **Felder:** `user_id`, `display_name`, `birth_date` (nullable), `sex` (nullable),
  `height_cm`, `weight_kg` (nullable), `max_hr`, `resting_hr_baseline`,
  `hrv_baseline`, `timezone`, `locale`, `goals` (JSON, z. B. Zielwettkampf),
  `preferences` (JSON, z. B. LLM an/aus, Einheiten).
- **Beziehungen:** gehört zu genau einem `users`.
- **Normalisiert.** Baselines sind für die Analyse zentral.

### 3.3 `provider_accounts`
- **Zweck:** Verknüpfung Nutzer ↔ externe Datenquelle inkl. Auth.
- **Felder:** `id`, `user_id`, `provider` (`strava`/`garmin_official`/
  `garmin_unofficial`/...), `external_user_id`, `access_token` *(verschlüsselt)*,
  `refresh_token` *(verschlüsselt)*, `token_expires_at`, `scopes`, `status`
  (`connected`/`expired`/`revoked`/`error`), `connected_at`, `last_sync_at`,
  `auth_mode` (für Garmin: official/unofficial), `secrets` *(verschlüsselt, JSON –
  z. B. Session für inoffiziellen Connector)*.
- **Beziehungen:** gehört zu `users`; Quelle für `activities`, `*_metrics`, `sync_jobs`.
- **Provider-spezifisch** (Auth-Details), aber einheitliche Hülle.
- **Sicherheit:** Tokens/Secrets immer verschlüsselt; nie an Clients ausliefern.

### 3.4 `raw_imports` (Rohdaten-Staging) *(empfohlen, ergänzend zur Liste)*
- **Zweck:** Unveränderte Provider-Antworten für Audit/Reprocessing.
- **Felder:** `id`, `user_id`, `provider_account_id`, `entity_type`
  (`activity`/`health`/`sleep`/...), `source_external_id`, `payload` (JSONB),
  `fetched_at`, `processed_at` (nullable), `processing_error` (nullable).
- **Provider-spezifisch (roh).** Quelle der Normalisierung.

### 3.5 `activities`
- **Zweck:** Normalisierte Trainingseinheit.
- **Felder:** `id`, `user_id`, `provider_account_id`, `source`, `source_external_id`
  (unique je user+source), `type` (`run`/`ride`/`swim`/...), `start_time`, `timezone`,
  `duration_sec`, `distance_m`, `elevation_gain_m`, `avg_hr`, `max_hr`,
  `avg_power_w` (nullable), `calories` (nullable), `perceived_exertion` (nullable),
  `training_load` (berechnet), `raw_import_id` (ref), `created_at`.
- **Beziehungen:** gehört zu `users`/`provider_accounts`; optional verknüpft mit `workouts`
  (Soll/Ist).
- **Normalisiert.** Detaildaten/Streams optional separat (`activity_streams`, Later).

### 3.6 `daily_health_metrics`
- **Zweck:** Tagesaggregierte Gesundheitswerte.
- **Felder:** `id`, `user_id`, `provider_account_id`, `source`, `date`,
  `resting_hr`, `hrv` (z. B. rMSSD/Score), `steps`, `body_battery` (nullable,
  Garmin-spezifisch → optional), `stress_avg` (nullable), `weight_kg` (nullable),
  `raw_import_id`.
- **Beziehungen:** 1 Datensatz pro `user_id`+`date`+`source` (oder gemerged, s. u.).
- **Normalisiert**, aber einige Felder sind **provider-spezifisch** (z. B. Body Battery)
  → in normalisiertem Modell als optionale Felder oder in `extra` (JSON) halten.

### 3.7 `sleep_records`
- **Zweck:** Schlafdaten je Nacht.
- **Felder:** `id`, `user_id`, `provider_account_id`, `source`, `date`,
  `sleep_start`, `sleep_end`, `total_sleep_sec`, `deep_sec`, `light_sec`, `rem_sec`,
  `awake_sec`, `sleep_score` (nullable), `raw_import_id`.
- **Beziehungen:** gehört zu `users`.
- **Normalisiert**; Schlafphasen-Granularität provider-abhängig (fehlende Werte nullable).

### 3.8 `readiness_metrics`
- **Zweck:** Abgeleitete tägliche Bereitschaft/Erholung + longitudinale Last (berechnet,
  nicht roh). Kern des „Loop" (s. architecture §4).
- **Felder:** `id`, `user_id`, `date`, `readiness_score` (0–100),
  `atl` (acute load / Ermüdung), `ctl` (chronic load / Fitness), `tsb` (= ctl − atl / Form),
  `load_ratio` (akut/chronisch), `hrv_vs_baseline`, `rhr_vs_baseline`, `sleep_factor`,
  `inputs` (JSON: welche Daten), `computed_at`, `engine_version`.
- **Beziehungen:** gehört zu `users`; Eingaben aus `daily_health_metrics`/`sleep_records`/
  `activities`.
- **Abgeleitet/normalisiert.** Provider-unabhängig (vom System berechnet); wird
  **persistent fortgeschrieben**, nicht pro Anfrage neu erzeugt.

### 3.8a `training_thresholds`  *(neu, aus Orientierung Reel 2)*
- **Zweck:** Versionierte Schwellen & Zonen je Nutzer; ermöglicht Neuberechnung von Zonen
  bei Fitness-Änderung (FTP-Shift etc.).
- **Felder:** `id`, `user_id`, `sport` (`run`/`ride`/`swim`), `effective_from` (Datum),
  `ftp_w` (nullable), `threshold_hr` (nullable), `threshold_pace` (nullable), `max_hr`,
  `zones` (JSON: Zonengrenzen), `source` (`manual`/`derived`/`provider`), `created_at`.
- **Beziehungen:** gehört zu `users`; mehrere Einträge bilden eine **Historie**
  (jüngster gültiger Satz pro `effective_from` zählt).
- **Normalisiert/abgeleitet.**

### 3.8b `health_events`  *(neu, aus Orientierung Reel 2)*
- **Zweck:** Kontext-Gedächtnis: Verletzungen, Krankheit, Pausen, Hinweise – fließen als
  Leitplanken in Empfehlungen ein.
- **Felder:** `id`, `user_id`, `type` (`injury`/`illness`/`break`/`note`), `start_date`,
  `end_date` (nullable, offen = laufend), `severity` (nullable), `affected_area`
  (nullable, z. B. Knie), `notes`, `source` (`user`/`bot`/`web`), `created_at`.
- **Beziehungen:** gehört zu `users`; wird von Analyse/Coach gelesen.
- **Normalisiert.**

### 3.9 `training_plans`
- **Zweck:** Übergeordneter Plan (Zeitraum, Ziel).
- **Felder:** `id`, `user_id`, `name`, `goal` (z. B. „10k unter 50min“),
  `start_date`, `end_date`, `status` (`active`/`draft`/`archived`),
  `created_by` (`user`/`ai`), `created_at`.
- **Beziehungen:** 1:N `workouts`.
- **Normalisiert.** (Feature ab „Later“, Modell aber früh vorgesehen.)

### 3.10 `workouts`
- **Zweck:** Geplante Einzeleinheit (Soll).
- **Felder:** `id`, `user_id`, `training_plan_id` (nullable), `date`, `type`,
  `target_duration_sec`, `target_distance_m` (nullable), `target_intensity`
  (z. B. Zone), `structure` (JSON: Intervallstruktur für Export), `description`,
  `status` (`planned`/`done`/`skipped`), `linked_activity_id` (nullable → Ist),
  `created_by` (`user`/`ai`),
  **Write-back (S3):** `export_status` (`none`/`exported`/`pushed`),
  `export_target` (`file`/`intervals_icu`), `export_format` (z. B. `fit`),
  `external_ref` (nullable, ID auf Zielplattform).
- **Beziehungen:** gehört zu `training_plans` (optional) und kann mit einer `activity`
  verknüpft sein (Soll/Ist).
- **Normalisiert.** Hinweis (R-T11): Write-back v0 nur als Datei-Export oder via
  intervals.icu (offizielle API), **nicht** über den inoffiziellen Garmin-Connector.

### 3.10a `menstrual_cycles`  *(neu, S1 – Zyklus-Tracking)*
- **Zweck:** Zyklusdaten zur deterministischen Phasenbestimmung und phasenbewussten
  Empfehlungen (opt-in pro Nutzer).
- **Felder:** `id`, `user_id`, `period_start` (Datum), `period_end` (nullable),
  `cycle_length_days` (nullable, abgeleitet/eingegeben), `symptoms` (JSON, optional),
  `source` (`manual`/`garmin`), `created_at`.
- **Abgeleitet zur Laufzeit:** aktuelle **Phase** (Menstruation/Follikel/Ovulation/Luteal)
  wird aus den letzten Einträgen berechnet (nicht zwingend persistiert).
- **Beziehungen:** gehört zu `users`.
- **Sehr sensibel** (Gesundheitsdaten) → strikt user-scoped, opt-in. **Keine medizinische
  Beratung** (Disclaimer).

### 3.10b `nutrition_recommendations`  *(neu, S2 – Ernährungs-Guidance v0)*
- **Zweck:** Tägliche grobe Ernährungs-Richtwerte/Guidance aus Last/Zielen/Phase
  (kein Food-Logging).
- **Felder:** `id`, `user_id`, `date`, `kind` (`daily`/`around_workout`),
  `calorie_target_range` (nullable), `macro_focus` (JSON, z. B. Kohlenhydrat-Fokus an
  harten Tagen), `hydration_hint`, `timing_hint`, `rationale` (JSON: Regeln/Inputs),
  `explanation_text` (Claude, nullable), `engine_version`, `created_at`.
- **Beziehungen:** gehört zu `users`; Inputs aus `readiness_metrics`/`activities`/
  `menstrual_cycles`/`user_profiles.goals`.
- **Abgeleitet.** **Keine diätetische/medizinische Beratung** (Disclaimer).

### 3.11 `recommendations`
- **Zweck:** Konkrete Empfehlung (Tag/Training/Recovery) **mit Begründung**.
- **Felder:** `id`, `user_id`, `date`, `kind` (`daily`/`training`/`recovery`),
  `decision` (z. B. `rest`/`easy`/`hard`), `rationale` (strukturiert: Regeln+Werte, JSON),
  `explanation_text` (LLM-Klartext, nullable), `source_engine_version`,
  `inputs_ref` (JSON: genutzte Metriken/IDs), `created_at`,
  `feedback` (nullable: Nutzer-Reaktion).
- **Beziehungen:** gehört zu `users`; referenziert `readiness_metrics`/`activities`.
- **Abgeleitet.** Kern der Explainability.

### 3.12 `chat_sessions`
- **Zweck:** Gesprächskontext mit dem KI-Coach (Bot oder Web).
- **Felder:** `id`, `user_id`, `channel` (`telegram`/`web`), `started_at`,
  `last_message_at`, `title` (nullable), `status` (`active`/`closed`).
- **Beziehungen:** 1:N `messages`.
- **Normalisiert.**

### 3.13 `messages`
- **Zweck:** Einzelne Chat-Nachricht.
- **Felder:** `id`, `chat_session_id`, `user_id`, `role` (`user`/`assistant`/`system`),
  `content`, `created_at`, `tokens` (nullable), `meta` (JSON: genutzte Daten/Modell).
- **Beziehungen:** gehört zu `chat_sessions`.
- **Normalisiert.** Hinweis: Inhalte sind privat; ggf. nicht alles an LLM geben.

### 3.14 `sync_jobs`
- **Zweck:** Protokoll & Steuerung von Importläufen.
- **Felder:** `id`, `user_id`, `provider_account_id`, `type` (`backfill`/`incremental`/
  `token_refresh`/`webhook`), `status` (`queued`/`running`/`success`/`failed`),
  `range_from`, `range_to`, `started_at`, `finished_at`, `error` (nullable),
  `stats` (JSON: importiert/aktualisiert/übersprungen), `attempt`, `next_retry_at`.
- **Beziehungen:** gehört zu `users`/`provider_accounts`.
- **Intern/operativ.**

### 3.15 `ai_insights`
- **Zweck:** Längerfristige, abgeleitete Erkenntnisse/Trends (über Einzeltage hinaus).
- **Felder:** `id`, `user_id`, `period` (z. B. Woche/Monat), `type`
  (`trend`/`anomaly`/`summary`), `summary_text`, `data` (JSON: Kennzahlen/Belege),
  `confidence` (nullable), `engine_version`, `created_at`.
- **Beziehungen:** gehört zu `users`.
- **Abgeleitet.**

---

## 4. Provider-spezifisch vs. normalisiert – Regeln

| Datenart | Speicherung |
|----------|-------------|
| Originale Provider-Payloads | **roh** in `raw_imports` (JSONB), unverändert |
| Auth/Tokens/Sessions | provider-spezifisch in `provider_accounts` (verschlüsselt) |
| Aktivitäten, Tageswerte, Schlaf | **normalisiert** (gemeinsames Schema) + Quellbezug |
| Provider-Spezialwerte (z. B. Body Battery, Stress) | im normalisierten Modell als **optionale** Felder oder `extra`-JSON, nicht als Pflicht |
| Berechnete Werte (Load, Readiness, Insights) | **abgeleitet**, provider-unabhängig, mit `engine_version` |

**Deduplizierung mehrerer Quellen:** Gleiche reale Aktivität kann aus Strava **und**
Garmin kommen. Strategie (offen, s. open-questions): Heuristik über
`start_time`±Toleranz + `duration`/`distance`. Ergebnis entweder „bevorzugte Quelle“
pro Aktivität oder Merge mit Quellpriorität (z. B. Garmin > Strava bei HR/HRV).

---

## 5. Indizes & Constraints (konzeptionell)

- Unique: `users.email`, `users.telegram_user_id`, `(user_id, source, source_external_id)`
  auf `activities`, `(user_id, date, source)` auf `daily_health_metrics`/`sleep_records`.
- Index: `activities(user_id, start_time)`, `readiness_metrics(user_id, date)`,
  `sync_jobs(status, next_retry_at)`, `messages(chat_session_id, created_at)`.
- FK mit `ON DELETE CASCADE` über `user_id` (DSGVO-Löschung).

---

## 6. Offene Datenmodell-Fragen (Auszug, Details in open-questions.md)
- Deduplizierungs-/Merge-Strategie bei Mehrfachquellen.
- Granularität von Streams (Sekundendaten) – früh oder später?
- Body-Battery/Stress nur Garmin → Pflicht-Optionalfelder oder generisches `extra`?
- Aufbewahrungsdauer von Rohdaten (`raw_imports`) vs. Speicherkosten.
