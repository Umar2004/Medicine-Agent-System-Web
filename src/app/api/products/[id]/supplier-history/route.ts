import { errors, handler, paginated, parsePagination, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { findProduct } from "@/lib/products";
import { priceHistory, requireSupplierPrices } from "@/lib/supplier-prices";

export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Product");
  const user = await requireAuth(req);
  const companyId = await requireSupplierPrices(req, user);
  if (!(await findProduct(id))) throw errors.notFound("Product");

  const { page, pageSize, offset } = parsePagination(req.nextUrl.searchParams);
  const { rows, total } = await priceHistory(id, companyId, pageSize, offset);
  return paginated(rows, total, page, pageSize);
});
