import { and, asc, eq, gt, not, sql } from "drizzle-orm";
import { db, productBatches, products } from "@/db";
import { errors, handler, ok, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { BATCH_READ_ROUTES, batchQuery, deactivateExpiredBatches, expSortKey, isExpired } from "@/lib/batches";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/** Batches usable for assignment (CLAUDE.md §7.8): stock > 0, active, not expired, earliest expiry first. */
export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Product");
  const user = await requireAuth(req);
  await requireAnyModule(user, BATCH_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });
  await deactivateExpiredBatches();

  const [product] = await db
    .select({
      id: products.id,
      brandName: products.brandName,
      lowStockThreshold: products.lowStockThreshold,
      totalStock: sql<number>`coalesce((select sum(${productBatches.stockQuantity}) from ${productBatches}
        where ${productBatches.productId} = ${products.id} and ${productBatches.isDeleted} = false), 0)::int`,
    })
    .from(products)
    .where(and(eq(products.id, id), eq(products.isDeleted, false)))
    .limit(1);
  if (!product) throw errors.notFound("Product");

  const batches = await batchQuery()
    .where(
      and(
        eq(productBatches.productId, id),
        eq(productBatches.isDeleted, false),
        eq(productBatches.isActive, true),
        gt(productBatches.stockQuantity, 0),
        not(isExpired),
      ),
    )
    .orderBy(asc(expSortKey), asc(productBatches.createdAt));

  return ok({ product, batches });
});
