import { errors, handler, isUuid, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { requireCompany } from "@/lib/company-context";
import { lastSalePrice, ORDER_READ_ROUTES } from "@/lib/orders";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/** GET ?customerId=&productId= → last quoted USD price for this customer, or null. */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await requireCompany(req, user);
  await requireAnyModule(user, ORDER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const customerId = req.nextUrl.searchParams.get("customerId");
  const productId = req.nextUrl.searchParams.get("productId");
  if (!isUuid(customerId) || !isUuid(productId)) throw errors.badRequest("customerId and productId are required");
  return ok(await lastSalePrice(companyId, customerId, productId));
});
