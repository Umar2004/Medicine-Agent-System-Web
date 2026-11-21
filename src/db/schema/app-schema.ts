import { pgSchema } from "drizzle-orm/pg-core";

/**
 * All tables live in the `app` Postgres schema. The legacy .NET app still uses
 * `public.*` in the same database; the two must never share tables.
 */
export const appSchema = pgSchema("app");
