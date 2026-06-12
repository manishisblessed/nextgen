import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your hosting provider's environment variables (or copy .env.example to .env.local for local dev)."
    );
  }
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * Lazy Prisma proxy. The real client is constructed only on first property
 * access, so importing this module at build time (e.g. during Next.js page
 * data collection) never crashes when DATABASE_URL isn't set in CI.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = buildClient();
    }
    return Reflect.get(globalForPrisma.prisma, prop, receiver);
  },
});
