import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

// `next build` loads every route module to collect page data, with no database
// involved. Preview deployments deliberately have no DATABASE_URL (they must not
// reach the production database), so the build must not fail without one. At run
// time a missing URL is still a hard error.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (!databaseUrl && !isBuildPhase) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl ?? "postgres://build:build@127.0.0.1:1/build",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
