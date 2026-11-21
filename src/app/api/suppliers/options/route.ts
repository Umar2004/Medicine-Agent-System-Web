import { and, asc, eq } from "drizzle-orm";
import { companies, db, suppliers } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/**
 * Supplier dropdown for the (shared) batch form: suppliers from ALL companies,
 * labelled with their company (MASTER_PROMPT Phase 2 → Batches).
 */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  await requireAnyModule(user, ["/batches", "/suppliers", "/products"], {
    meta: getRequestMeta(req),
    companyId: null,
  });

  const rows = await db
    .select({
      id: suppliers.id,
      supplierNumber: suppliers.supplierNumber,
      name: suppliers.name,
      companyId: suppliers.companyId,
      companyName: companies.name,
    })
    .from(suppliers)
    .innerJoin(companies, eq(companies.id, suppliers.companyId))
    .where(and(eq(suppliers.isDeleted, false), eq(companies.isDeleted, false)))
    .orderBy(asc(suppliers.name), asc(companies.name));

  return ok(rows);
});
