import { and, eq, inArray, sql } from "drizzle-orm";
import { db, orderItems, orders, productBatches, products } from "@/db";
import { errors, handler, ok, parseBody } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { isExpired } from "@/lib/batches";
import { ACTION_TYPES } from "@/lib/constants";
import { centsToDecimal, lineTotalCents } from "@/lib/money";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail, lockOrder } from "@/lib/orders";
import { assignBatchesSchema } from "@/lib/validations";

/**
 * Warehouse assigns batches to a confirmed PI (CLAUDE.md §7.2 step 4, §7.8):
 * confirmed → batch_assigned, stock deducted here. The document stays a proforma_invoice.
 * A line may be split across batches; split rows keep the line's sort_order.
 */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "approve_orders");
  const { allocations } = await parseBody(req, assignBatchesSchema);

  const deducted = await db.transaction(async (tx) => {
    await lockOrder(tx, id, companyId, ["confirmed"]);
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

    // Every line exactly once, quantities must add up.
    const byLine = new Map(allocations.map((a) => [a.orderItemId, a.batches]));
    if (byLine.size !== allocations.length) throw errors.badRequest("A line appears twice in the assignment");
    for (const line of lines) {
      const parts = byLine.get(line.id);
      if (!parts) throw errors.badRequest("Assign batches for every line");
      const sum = parts.reduce((s, p) => s + p.quantity, 0);
      if (sum !== line.quantity) {
        throw errors.badRequest(`Assigned ${sum} but the line needs ${line.quantity}. Quantities must match exactly.`);
      }
      if (new Set(parts.map((p) => p.batchId)).size !== parts.length) {
        throw errors.badRequest("The same batch is listed twice for one line");
      }
    }
    if (byLine.size !== lines.length) throw errors.badRequest("Assignment contains lines that are not on this order");

    // Lock batches and check product / active / expiry / stock.
    const need = new Map<string, number>();
    for (const parts of byLine.values()) for (const p of parts) need.set(p.batchId, (need.get(p.batchId) ?? 0) + p.quantity);
    const batches = await tx
      .select({
        id: productBatches.id,
        productId: productBatches.productId,
        batchNumber: productBatches.batchNumber,
        stockQuantity: productBatches.stockQuantity,
        isActive: productBatches.isActive,
        isDeleted: productBatches.isDeleted,
        expired: sql<boolean>`${isExpired}`,
      })
      .from(productBatches)
      .where(inArray(productBatches.id, [...need.keys()]))
      .for("update");
    const batchMap = new Map(batches.map((b) => [b.id, b]));

    for (const line of lines) {
      for (const p of byLine.get(line.id)!) {
        const b = batchMap.get(p.batchId);
        if (!b || b.isDeleted) throw errors.badRequest("A selected batch no longer exists");
        if (b.productId !== line.productId) throw errors.badRequest(`Batch ${b.batchNumber} is for a different product`);
        if (!b.isActive || b.expired) throw errors.conflict(`Batch ${b.batchNumber} is inactive or expired`);
      }
    }
    for (const [batchId, qty] of need) {
      const b = batchMap.get(batchId)!;
      if (b.stockQuantity < qty) {
        throw errors.conflict(`Batch ${b.batchNumber} has only ${b.stockQuantity} in stock (needs ${qty}).`);
      }
    }

    for (const [batchId, qty] of need) {
      await tx
        .update(productBatches)
        .set({ stockQuantity: sql`${productBatches.stockQuantity} - ${qty}`, updatedAt: new Date() })
        .where(eq(productBatches.id, batchId));
    }

    for (const line of lines) {
      const [first, ...rest] = byLine.get(line.id)!;
      await tx
        .update(orderItems)
        .set({
          batchId: first.batchId,
          quantity: first.quantity,
          totalUsd: centsToDecimal(lineTotalCents(first.quantity, line.sellingPriceUsd)),
        })
        .where(eq(orderItems.id, line.id));
      if (rest.length) {
        await tx.insert(orderItems).values(
          rest.map((p) => ({
            orderId: id,
            productId: line.productId,
            mfd: line.mfd,
            exp: line.exp,
            quantity: p.quantity,
            unit: line.unit,
            sellingPriceUsd: line.sellingPriceUsd,
            totalUsd: centsToDecimal(lineTotalCents(p.quantity, line.sellingPriceUsd)),
            batchId: p.batchId,
            sortOrder: line.sortOrder,
          })),
        );
      }
    }

    await tx
      .update(orders)
      .set({ status: "batch_assigned", updatedAt: new Date() })
      .where(eq(orders.id, id));

    return [...need].map(([batchId, quantity]) => ({
      batchId,
      batchNumber: batchMap.get(batchId)!.batchNumber,
      quantity,
      stockAfter: batchMap.get(batchId)!.stockQuantity - quantity,
    }));
  });

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
    newValue: { deducted },
    meta,
  });
  return ok({ ...(await getOrderDetail(id, companyId)), lowStock });
});
