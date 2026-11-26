import { and, eq, inArray, sql } from "drizzle-orm";
import { db, productBatches, products } from "@/db";
import { handler, ok, parseBody } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { applyBatchAssignment } from "@/lib/batch-assignment";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail } from "@/lib/orders";
import { assignBatchesSchema } from "@/lib/validations";

/**
 * Warehouse assigns batches to a confirmed PI (CLAUDE.md §7.2 step 4, §7.8):
 * confirmed → batch_assigned, stock deducted here. The document stays a proforma_invoice.
 * A line may be split across batches; split rows keep the line's sort_order. Also edits a batch_assigned PI
 * (see applyBatchAssignment).
 */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "approve_orders");
  const { allocations } = await parseBody(req, assignBatchesSchema);

  const { deducted, restored } = await db.transaction((tx) => applyBatchAssignment(tx, id, companyId, allocations));

  // Products now under their low-stock threshold (informational).
  const batchIds = deducted.map((d) => d.batchId);
  const lowStock = batchIds.length
    ? await db
        .select({
          productId: products.id,
          brandName: products.brandName,
          threshold: products.lowStockThreshold,
          totalStock: sql<number>`coalesce(sum(${productBatches.stockQuantity}), 0)::int`,
        })
        .from(products)
        .innerJoin(productBatches, and(eq(productBatches.productId, products.id), eq(productBatches.isDeleted, false)))
        .where(
          inArray(
            products.id,
            db.select({ id: productBatches.productId }).from(productBatches).where(inArray(productBatches.id, batchIds)),
          ),
        )
        .groupBy(products.id)
        .having(sql`coalesce(sum(${productBatches.stockQuantity}), 0) < ${products.lowStockThreshold}`)
    : [];

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.BATCHES_ASSIGNED,
    entityName: "Order",
    entityId: id,
    // An edit records what it replaced: the previous batches' stock was restored before the new deduction.
    newValue: restored.length ? { edited: true, restored, deducted } : { deducted },
    meta,
  });
  return ok({ ...(await getOrderDetail(id, companyId)), lowStock });
});
