import { eq } from "drizzle-orm";
import { db, orders } from "@/db";
import { handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail, lockOrder, releaseBatches } from "@/lib/orders";

/** batch_assigned → confirmed, stock restored; the document stays a proforma_invoice (CLAUDE.md §7.2 step 4). */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "approve_orders");

  const released = await db.transaction(async (tx) => {
    await lockOrder(tx, id, companyId, ["batch_assigned"]);
    const result = await releaseBatches(tx, id);
    await tx
      .update(orders)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(orders.id, id));
    return result;
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.BATCHES_UNASSIGNED,
    entityName: "Order",
    entityId: id,
    newValue: { restored: released },
    meta,
  });
  return ok(await getOrderDetail(id, companyId));
});
