import { eq } from "drizzle-orm";
import { db, orders } from "@/db";
import { handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail, lockOrder } from "@/lib/orders";

/** PI sent to the customer: draft → sent (also re-sends a revised negotiating PI). Replaces "mark as sent". */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "manage_proforma_invoices");

  const from = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, id, companyId, ["draft", "negotiating"]);
    const now = new Date();
    await tx
      .update(orders)
      .set({ status: "sent", sentAt: now, rejectionReason: null, rejectedBy: null, rejectedAt: null, updatedAt: now })
      .where(eq(orders.id, id));
    return order;
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PI_SENT,
    entityName: "Order",
    entityId: id,
    newValue: { from: from.status, revisionNumber: from.revisionNumber },
    meta,
  });
  return ok(await getOrderDetail(id, companyId));
});
