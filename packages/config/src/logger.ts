import { pino } from "pino";
import { loadEnv } from "./env";

/**
 * Gemeinsamer strukturierter Logger. Sensible Felder werden redigiert,
 * damit keine Tokens/Secrets in Logs landen (NFR-SEC).
 */
export function createLogger(name: string) {
  return pino({
    name,
    level: loadEnv().LOG_LEVEL,
    redact: {
      paths: [
        "*.access_token",
        "*.refresh_token",
        "*.password",
        "*.token",
        "req.headers.authorization",
      ],
      censor: "[redacted]",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
