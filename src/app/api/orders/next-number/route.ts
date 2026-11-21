import { and, eq } from "drizzle-orm";
import { customers, db } from "@/db";
import { errors, handler, isUuid, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { requireCompany } from "@/lib/company-context";
import { nextProformaNumber } from "@/lib/number-generator";
import { ORDER_READ_ROUTES } from "@/lib/orders";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/**
 * GET ?customerId= → { orderNumber } preview of the next PI number, e.g. PI-SFL-0007. The number
 * contains the customer code, so a customer is required. The real number is assigned on save.
 */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await requireCompany(req, user);
  await requireAnyModule(user, ORDER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const customerId = req.nextUrl.searchParams.get("customerId");
  if (!isUuid(customerId)) throw errors.badRequest("customerId is required");
  const [customer] = await db
    .select({ code: customers.code })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId), eq(customers.isDeleted, false)))
    .limit(1);
  if (!customer) throw errors.badRequest("Selected customer does not exist in this company");

  return ok({ orderNumber: await nextProformaNumber(db, companyId, customer.code) });
});
