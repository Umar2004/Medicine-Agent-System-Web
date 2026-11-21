import { handler, paginated, parsePagination } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { listPriceSummaries, requireSupplierPrices } from "@/lib/supplier-prices";

/** Products with recorded supplier prices, with the lowest current price per type. */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await requireSupplierPrices(req, user);

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { rows, total } = await listPriceSummaries(companyId, params.get("search")?.trim() || undefined, pageSize, offset);
  return paginated(rows, total, page, pageSize);
});
