import { and, eq } from "drizzle-orm";
import { db, orders } from "@/db";
import { errors, handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail, lockOrder, releaseBatches } from "@/lib/orders";
import { requirePermission } from "@/lib/permissions";

/**
 * Cancel a PI from draft / sent / negotiating / confirmed / batch_assigned (CLAUDE.md §7.10).
 * batch_assigned → undo first (stock restored), so it needs approve_orders; otherwise
 * manage_proforma_invoices. Once invoiced, cancel the invoice first.
 */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, null);

  const [current] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.companyId, companyId), eq(orders.isDeleted, false)))
    .limit(1);
  if (!current) throw errors.notFound("Order");
  await requirePermission(user, current.status === "batch_assigned" ? "approve_orders" : "manage_proforma_invoices", {
    meta,
    companyId,
  });

  const released = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, id, companyId, ["draft", "sent", "negotiating", "confirmed", "batch_assigned"]);
    const result = order.status === "batch_assigned" ? await releaseBatches(tx, id) : [];
    await tx
      .update(orders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(orders.id, id));
    return { from: order.status, restored: result };
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.ORDER_CANCELLED,
    entityName: "Order",
    entityId: id,
    newValue: released,
    meta,
  });
  return ok(await getOrderDetail(id, companyId));
});
