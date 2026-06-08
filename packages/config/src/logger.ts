import { pino } from "pino";

/**
 * Gemeinsamer strukturierter Logger. Sensible Felder werden redigiert,
 * damit keine Tokens/Secrets in Logs landen (NFR-SEC).
 */
export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
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
