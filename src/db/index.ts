import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** Transaction handle passed to `db.transaction(async (tx) => …)`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Reuse the connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __maDb?: Database };

function createDb(): Database {
  // prepare: false — required for Supabase's transaction pooler (port 6543).
  const client = postgres(env().DATABASE_URL, { prepare: false, max: 10 });
  return drizzle(client, { schema });
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    globalForDb.__maDb ??= createDb();
    return Reflect.get(globalForDb.__maDb, prop, receiver);
  },
});

export * from "./schema";
