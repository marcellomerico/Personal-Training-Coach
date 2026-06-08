import { z } from "zod";

/**
 * Zentrale Env-Validierung. Schlägt früh und laut fehl, wenn Pflichtwerte fehlen.
 * Jeder Service ruft `loadEnv()` einmal beim Start auf.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().url(),

  API_PORT: z.coerce.number().int().positive().default(3001),

  // Verschlüsselung sensibler Felder (Tokens) at rest.
  ENCRYPTION_KEY: z.string().min(16).optional(),
  SESSION_SECRET: z.string().min(16).optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // LLM (Claude) – optional/abschaltbar
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

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
