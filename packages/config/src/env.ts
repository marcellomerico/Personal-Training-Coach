import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Lädt die `.env` aus dem Monorepo-Root (erkennbar an pnpm-workspace.yaml),
 * unabhängig vom aktuellen Arbeitsverzeichnis des jeweiligen Services.
 * Bereits gesetzte Umgebungsvariablen werden NICHT überschrieben
 * (CI/Prod-Env hat Vorrang).
 */
let dotenvLoaded = false;
function ensureDotenv(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(join(dir, "pnpm-workspace.yaml")) && existsSync(candidate)) {
      loadDotenv({ path: candidate });
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Zusätzlich ein evtl. lokales .env (cwd) zulassen.
  loadDotenv();
}

/**
 * Zentrale Env-Validierung. Schlägt früh und laut fehl, wenn Pflichtwerte fehlen.
 * Jeder Service ruft `loadEnv()` einmal beim Start auf.
 */
const optionalMinString = (min: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(min).optional(),
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  DATABASE_URL: z.string().url(),

  API_PORT: z.coerce.number().int().positive().default(3001),
  // Basis-URL der API (z. B. für den Bot, der die API aufruft).
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  // Erlaubte Origins für CORS (kommasepariert), z. B. Web-App im Dev.
  WEB_ORIGIN: z.string().default("http://localhost:3000"),

  // Verschlüsselung sensibler Felder (Tokens) at rest.
  ENCRYPTION_KEY: optionalMinString(32),
  SESSION_SECRET: optionalMinString(16),
  // Cookie-Name der Session.
  SESSION_COOKIE_NAME: z.string().default("ptc_session"),
  // Session-Lebensdauer in Tagen.
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Interner Shared-Secret-Key für Service-zu-Service-Calls (Bot -> API).
  INTERNAL_API_KEY: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  // Bot-Username (ohne @) für Deep-Links: https://t.me/<username>?start=<token>
  TELEGRAM_BOT_USERNAME: z.string().optional(),

  // LLM (Erklärungsschicht) – optional/abschaltbar
  LLM_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Anbieter der Erklärungsschicht.
  LLM_PROVIDER: z.enum(["anthropic", "gemini"]).default("anthropic"),

  // Anthropic (Claude) – kostenpflichtig.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Modell für den Anthropic-Pfad. Default: aktuelles Opus.
  LLM_MODEL: z.string().default("claude-opus-4-8"),

  // Google Gemini – Free-Tier verfügbar (Cloud; Gesundheitsdaten verlassen das Gerät).
  GEMINI_API_KEY: z.string().optional(),
  // Modell für den Gemini-Pfad. Default: schnelles Free-Tier-Modell.
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),

  // Connectors
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  GARMIN_MODE: z.enum(["official", "unofficial", "off"]).default("unofficial"),
  GARMIN_CONNECTOR_URL: z.string().url().default("http://localhost:8000"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  if (source === process.env) ensureDotenv();
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Ungültige Umgebungskonfiguration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
