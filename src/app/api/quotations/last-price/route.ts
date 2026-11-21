import { errors, handler, isUuid, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { requireCompany } from "@/lib/company-context";
import { ORDER_READ_ROUTES } from "@/lib/orders";
import { requireAnyModule } from "@/lib/permissions";
import { lastQuotedPrice, QUOTATION_READ_ROUTES } from "@/lib/quotations";
import { getRequestMeta } from "@/lib/request-meta";

/**
 * GET ?customerId=&productId= → the most recent USD price quoted to this customer for the product,
 * from quotations OR PIs/orders (whichever is newer), or null.
 * Shape: { price, documentNumber, source: "quotation" | "order", date }.
 */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await requireCompany(req, user);
  await requireAnyModule(user, [...QUOTATION_READ_ROUTES, ...ORDER_READ_ROUTES], {
    meta: getRequestMeta(req),
    companyId,
  });

  const customerId = req.nextUrl.searchParams.get("customerId");
  const productId = req.nextUrl.searchParams.get("productId");
  if (!isUuid(customerId) || !isUuid(productId)) throw errors.badRequest("customerId and productId are required");
  return ok(await lastQuotedPrice(companyId, customerId, productId));
});
