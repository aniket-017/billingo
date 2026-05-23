import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Neon / pooler closes idle connections (Postgres E57P01). */
function isStaleConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('E57P01') ||
    msg.includes('terminating connection due to administrator command') ||
    msg.includes('Connection terminated') ||
    msg.includes('Connection reset') ||
    msg.includes('Client has encountered a connection error')
  );
}

export async function connectDb(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  await prisma.$connect();
  console.log('PostgreSQL connected');
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

/** Re-open the pool after Neon suspend or pooler dropped idle connections. */
export async function ensureDbConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    if (!isStaleConnectionError(err)) {
      throw err;
    }
    console.warn('PostgreSQL connection stale, reconnecting…');
    try {
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  }
}

export async function withDbReconnect<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isStaleConnectionError(err)) {
      throw err;
    }
    await ensureDbConnection();
    return fn();
  }
}
