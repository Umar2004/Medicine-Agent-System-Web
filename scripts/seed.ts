// Seeds reference data. Safe to run repeatedly.
//   - dashboard_modules (sidebar items)
//   - role_permissions (default sidebar visibility per role)
//   - role_function_permissions (default permission keys per role)
//   - a first company, if none exists (SEED_COMPANY_NAME)
// The owner account is created from the login page (one-time setup).
// Usage: npm run db:seed
//        npm run db:seed -- --samples [--dry-run]   (+ sample QT/PI documents — dev databases only;
//                                                   see scripts/seed-samples.ts)
import { config } from "dotenv";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { DEFAULT_ROLE_PERMISSIONS, type PermissionKey, type Role } from "../src/lib/constants";
import { DEFAULT_ROLE_MODULES, NAV_ITEMS } from "../src/lib/navigation";
import { seedSamples } from "./seed-samples";

const SAMPLES = process.argv.includes("--samples");
const DRY_RUN = process.argv.includes("--dry-run");

config({ path: ".env.local" });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in .env.local");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  try {
    if (SAMPLES && DRY_RUN) {
      await seedSamples(db, true);
      return;
    }

    // Sidebar modules
    for (const [index, item] of NAV_ITEMS.entries()) {
      await db
        .insert(schema.dashboardModules)
        .values({
          title: item.title,
          icon: item.icon,
          route: item.route,
          sortOrder: index,
          isDefault: item.isDefault ?? false,
        })
        .onConflictDoUpdate({
          target: schema.dashboardModules.route,
          set: { title: item.title, icon: item.icon, sortOrder: index, isDefault: item.isDefault ?? false },
        });
    }
    const modules = await db.select().from(schema.dashboardModules);
    const moduleIdByRoute = new Map(modules.map((m) => [m.route, m.id]));
    console.log(`Dashboard modules: ${modules.length}`);

    // Default sidebar visibility (only inserts missing rows; never removes owner edits)
    let moduleLinks = 0;
    for (const [role, routes] of Object.entries(DEFAULT_ROLE_MODULES) as [Role, string[]][]) {
      for (const route of routes) {
        const moduleId = moduleIdByRoute.get(route);
        if (!moduleId) continue;
        const inserted = await db
          .insert(schema.rolePermissions)
          .values({ role, moduleId })
          .onConflictDoNothing()
          .returning({ id: schema.rolePermissions.id });
        moduleLinks += inserted.length;
      }
    }
    console.log(`Role → module links added: ${moduleLinks}`);

    // Default permission keys
    let keyLinks = 0;
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as [Role, PermissionKey[]][]) {
      for (const key of keys) {
        const inserted = await db
          .insert(schema.roleFunctionPermissions)
          .values({ role, permissionKey: key })
          .onConflictDoNothing()
          .returning({ id: schema.roleFunctionPermissions.id });
        keyLinks += inserted.length;
      }
    }
    console.log(`Role → permission keys added: ${keyLinks}`);

    // First company
    const [{ total }] = await db
      .select({ total: count() })
      .from(schema.companies)
      .where(eq(schema.companies.isDeleted, false));
    if (total === 0) {
      const name = process.env.SEED_COMPANY_NAME ?? "My Company";
      await db.insert(schema.companies).values({ name });
      console.log(`Created company "${name}"`);
    } else {
      console.log(`Companies already exist (${total}); none created.`);
    }

    if (SAMPLES) await seedSamples(db, false);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
