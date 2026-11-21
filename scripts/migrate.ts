// Applies Drizzle migrations from src/db/migrations.
// Usage: npm run db:migrate                (apply)
//        npm run db:migrate -- --dry-run   (run pending migrations in a transaction, show the effect, roll back)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });

const MIGRATIONS = "./src/db/migrations";
const DRY_RUN = process.argv.includes("--dry-run");
const ROLLBACK = Symbol("rollback");

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

/** Row counts and status breakdowns for the app's document tables. */
async function snapshot(sql: postgres.Sql | postgres.TransactionSql) {
  const exists = async (table: string) =>
    (await sql`select to_regclass(${`app.${table}`}) is not null as ok`)[0].ok as boolean;
  const out: Record<string, unknown> = {};
  out.orders = (await sql`select document_type, status, count(*)::int n from app.orders group by 1, 2 order by 1, 2`).map(
    (r) => `${r.document_type}/${r.status}: ${r.n}`,
  );
  if (await exists("quotations")) {
    out.quotations = (await sql`select status, count(*)::int n from app.quotations group by 1 order by 1`).map(
      (r) => `${r.status}: ${r.n}`,
    );
    out.quotation_items = (await sql`select count(*)::int n from app.quotation_items`)[0].n;
  }
  out.order_items = (await sql`select count(*)::int n from app.order_items`)[0].n;
  out.invoices = (await sql`select count(*)::int n from app.invoices`)[0].n;
  out.order_columns = (
    await sql`select column_name from information_schema.columns
              where table_schema = 'app' and table_name = 'orders' and column_name in ('type', 'source_order_id', 'proforma_sent_at')
              order by 1`
  ).map((r) => r.column_name);
  return out;
}

function print(label: string, snap: Record<string, unknown>) {
  console.log(`\n${label}`);
  for (const [k, v] of Object.entries(snap)) {
    console.log(`  ${k.padEnd(16)} ${Array.isArray(v) ? (v.length ? v.join(", ") : "—") : v}`);
  }
}

async function dryRun(client: postgres.Sql): Promise<void> {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as Journal;
  const [{ last }] = await client`
    select coalesce(max(created_at), 0)::bigint as last from drizzle.__drizzle_migrations`;
  // Same rule as Drizzle's migrator: anything newer than the last applied migration is pending.
  const pending = journal.entries.filter((e) => e.when > Number(last));
  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }
  console.log(`DRY RUN — pending: ${pending.map((e) => e.tag).join(", ")}`);
  try {
    await client.begin(async (tx) => {
      print("Before", await snapshot(tx));
      for (const entry of pending) {
        const statements = readFileSync(join(MIGRATIONS, `${entry.tag}.sql`), "utf8")
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) await tx.unsafe(statement);
        console.log(`\n  ✓ ${entry.tag} (${statements.length} statements)`);
      }
      print("After", await snapshot(tx));
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
    console.log("\nDry run — rolled back, nothing written.");
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in .env.local");

  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    if (DRY_RUN) {
      await dryRun(client);
    } else {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
      console.log("Migrations applied.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
