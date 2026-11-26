import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { orderItems, orders, productBatches, type Transaction } from "@/db";
import { errors } from "@/lib/api";
import { isExpired } from "@/lib/batches";
import { centsToDecimal, lineTotalCents } from "@/lib/money";
import { lockOrder, releaseBatches } from "@/lib/orders";
import type { AssignBatchesInput } from "@/lib/validations";

/**
 * Assigns batches to a PI inside `tx` (CLAUDE.md §7.8): confirmed → batch_assigned, stock deducted.
 * On a batch_assigned PI (editing) the current assignment is released first — stock restored, split lines merged —
 * then the new one applied, so a failed edit rolls back to the old assignment. Lines are matched by sort_order
 * there, so any row id of a split line identifies the whole line.
 */
export async function applyBatchAssignment(
  tx: Transaction,
  id: string,
  companyId: string,
  allocations: AssignBatchesInput["allocations"],
) {
  const order = await lockOrder(tx, id, companyId, ["confirmed", "batch_assigned"]);

  let restored: { batchId: string; quantity: number }[] = [];
  let requested = allocations;
  if (order.status === "batch_assigned") {
    const before = await tx.select({ id: orderItems.id, sortOrder: orderItems.sortOrder }).from(orderItems).where(eq(orderItems.orderId, id));
    const sortOf = new Map(before.map((r) => [r.id, r.sortOrder]));
    restored = await releaseBatches(tx, id);
    const merged = await tx.select({ id: orderItems.id, sortOrder: orderItems.sortOrder }).from(orderItems).where(eq(orderItems.orderId, id));
    const lineAt = new Map(merged.map((r) => [r.sortOrder, r.id]));
    requested = allocations.map((a) => {
      const sort = sortOf.get(a.orderItemId);
      const lineId = sort === undefined ? undefined : lineAt.get(sort);
      if (!lineId) throw errors.badRequest("Assignment contains lines that are not on this order");
      return { ...a, orderItemId: lineId };
    });
  }

  const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

  // Every line exactly once, quantities must add up.
  const byLine = new Map(requested.map((a) => [a.orderItemId, a.batches]));
  if (byLine.size !== requested.length) throw errors.badRequest("A line appears twice in the assignment");
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

  const deducted = [...need].map(([batchId, quantity]) => ({
    batchId,
    batchNumber: batchMap.get(batchId)!.batchNumber,
    quantity,
    stockAfter: batchMap.get(batchId)!.stockQuantity - quantity,
  }));
  return { deducted, restored };
}
