import { PrismaClient } from "@prisma/client";

/**
 * Gemeinsamer Prisma-Client (Singleton). Wird von API und Worker genutzt.
 * In Entwicklung wird die Instanz über globalThis wiederverwendet (HMR).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
