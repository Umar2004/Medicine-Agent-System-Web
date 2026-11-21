import { errors, handler, ok, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { findProduct } from "@/lib/products";
import { comparePrices, requireSupplierPrices } from "@/lib/supplier-prices";

/** Lowest current price per type, plus every supplier's current price to compare against. */
export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Product");
  const user = await requireAuth(req);
  const companyId = await requireSupplierPrices(req, user);
  if (!(await findProduct(id))) throw errors.notFound("Product");

  const comparison = await comparePrices(id, companyId);
  const best = (type: string) => comparison.find((c) => c.isBest && c.priceType === type) ?? null;
  return ok({ wholesale: best("wholesale"), retail: best("retail"), comparison });
});
