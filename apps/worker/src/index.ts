import PgBoss from "pg-boss";
import { createLogger, decryptJsonSecret, loadEnv } from "@ptc/config";
import { GarminConnector } from "@ptc/connectors";
import { prisma } from "@ptc/db";
import {
  assertGarminSessionForRealAccount,
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
async function loadProviderAccount(providerAccountId: string) {
  return prisma.providerAccount.findUnique({
    where: { id: providerAccountId },
    select: { secrets: true, authMode: true },
  });
}

function decryptProviderSession(
  providerAccountId: string,
  secrets: string | null,
): Record<string, unknown> | undefined {
  if (!secrets) return undefined;
  try {
    return decryptJsonSecret<Record<string, unknown>>(secrets);
  } catch {
    log.warn({ providerAccountId }, "Garmin-Session nicht entschlüsselbar; Sync ohne Session.");
    return undefined;
  }
}

async function main() {
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err) => log.error(err));

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Worker shutdown");
    await boss.stop({ graceful: true, timeout: 10_000 });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await boss.start();
  await boss.createQueue(GARMIN_SYNC_QUEUE);

  log.info(
    {
      queue: GARMIN_SYNC_QUEUE,
      garminConnectorUrl: env.GARMIN_CONNECTOR_URL,
      nodeEnv: env.NODE_ENV,
    },
    "Worker gestartet (pg-boss)",
  );

  await boss.work<GarminSyncJobData>(GARMIN_SYNC_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { userId, providerAccountId, externalUserId, since, syncJobId } = job.data;
      const account = await loadProviderAccount(providerAccountId);
      const session = decryptProviderSession(providerAccountId, account?.secrets ?? null);
      assertGarminSessionForRealAccount(account?.authMode, session);
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

  log.info(`Queue '${GARMIN_SYNC_QUEUE}' registriert.`);
}

void main();
