import PgBoss from "pg-boss";
import { createLogger, loadEnv } from "@ptc/config";
import { GarminConnector } from "@ptc/connectors";
import { prisma } from "@ptc/db";
import { runGarminSync } from "@ptc/ingest";

/**
 * Background-Worker/Scheduler (pg-boss, nutzt Postgres als Queue).
 * Phase 2: Job `garmin-sync` ruft dieselbe Ingest-Orchestrierung wie die API auf.
 * Nächtliche Analyse/Token-Refresh folgen in späteren Phasen.
 */
const env = loadEnv();
const log = createLogger("worker");

export const GARMIN_SYNC_QUEUE = "garmin-sync";

export interface GarminSyncJobData {
  userId: string;
  providerAccountId: string;
  externalUserId: string | null;
  since?: string | null;
}

async function main() {
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err) => log.error(err));

  await boss.start();
  await boss.createQueue(GARMIN_SYNC_QUEUE);

  await boss.work<GarminSyncJobData>(GARMIN_SYNC_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { userId, providerAccountId, externalUserId, since } = job.data;
      const connector = new GarminConnector(
        { baseUrl: env.GARMIN_CONNECTOR_URL, apiKey: env.INTERNAL_API_KEY },
        "garmin_unofficial",
      );
      const stats = await runGarminSync(
        prisma,
        connector,
        {
          userId,
          providerAccountId,
          externalUserId,
          since: since ? new Date(since) : null,
        },
        log,
      );
      log.info({ jobId: job.id, ...stats }, "garmin-sync Job verarbeitet");
    }
  });

  log.info(`Worker gestartet (pg-boss). Queue '${GARMIN_SYNC_QUEUE}' registriert.`);
}

void main();
