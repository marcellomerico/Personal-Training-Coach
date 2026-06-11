import PgBoss from "pg-boss";
import { createLogger, decryptJsonSecret, loadEnv } from "@ptc/config";
import { GarminConnector } from "@ptc/connectors";
import { prisma } from "@ptc/db";
import {
  GARMIN_SYNC_QUEUE,
  runTrackedGarminSync,
  type GarminSyncJobData,
} from "@ptc/ingest";

/**
 * Background-Worker/Scheduler (pg-boss, nutzt Postgres als Queue).
 * Phase 2: Job `garmin-sync` ruft dieselbe Ingest-Orchestrierung wie die API auf.
 * Queue-Name und Job-Datentyp kommen aus @ptc/ingest (geteilt mit der API).
 * Nächtliche Analyse/Token-Refresh folgen in späteren Phasen.
 */
const env = loadEnv();
const log = createLogger("worker");

/**
 * Lädt die in `provider_accounts.secrets` verschlüsselte Session und gibt sie
 * entschlüsselt zurück. Bei fehlenden/ungültigen Secrets wird ohne Session
 * gesynct (Stub-Pfad).
 */
async function loadProviderSession(
  providerAccountId: string,
): Promise<Record<string, unknown> | undefined> {
  const account = await prisma.providerAccount.findUnique({
    where: { id: providerAccountId },
    select: { secrets: true },
  });
  if (!account?.secrets) return undefined;
  try {
    return decryptJsonSecret<Record<string, unknown>>(account.secrets);
  } catch {
    log.warn({ providerAccountId }, "Garmin-Session nicht entschlüsselbar; Sync ohne Session.");
    return undefined;
  }
}

async function main() {
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err) => log.error(err));

  await boss.start();
  await boss.createQueue(GARMIN_SYNC_QUEUE);

  await boss.work<GarminSyncJobData>(GARMIN_SYNC_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { userId, providerAccountId, externalUserId, since, syncJobId } = job.data;
      // Persistierte, verschlüsselte Session laden und entschlüsselt an den
      // Connector geben – damit der echte Datenabruf prozessunabhängig läuft.
      const session = await loadProviderSession(providerAccountId);
      const connector = new GarminConnector(
        { baseUrl: env.GARMIN_CONNECTOR_URL, apiKey: env.INTERNAL_API_KEY, session },
        "garmin_unofficial",
      );
      const result = await runTrackedGarminSync(
        prisma,
        connector,
        {
          userId,
          providerAccountId,
          externalUserId,
          since: since ? new Date(since) : null,
          syncJobId,
        },
        log,
      );
      log.info(
        { jobId: job.id, syncJobId: result.syncJob.id, ...result.stats },
        "garmin-sync Job verarbeitet",
      );
    }
  });

  log.info(`Worker gestartet (pg-boss). Queue '${GARMIN_SYNC_QUEUE}' registriert.`);
}

void main();
