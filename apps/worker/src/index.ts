import PgBoss from "pg-boss";
import { createLogger, loadEnv } from "@ptc/config";

/**
 * Background-Worker/Scheduler (pg-boss, nutzt Postgres als Queue).
 * Phase 1: nur Grundgerüst + Start. Jobs (Sync, Token-Refresh, nächtliche
 * Analyse) folgen in Phase 2+.
 */
const env = loadEnv();
const log = createLogger("worker");

async function main() {
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err) => log.error(err));

  await boss.start();
  log.info("Worker gestartet (pg-boss). Noch keine Jobs registriert (Phase 1).");
}

void main();
