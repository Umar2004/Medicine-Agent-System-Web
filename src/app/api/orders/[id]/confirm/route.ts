import { eq } from "drizzle-orm";
import { db, orders } from "@/db";
import { handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail, lockOrder } from "@/lib/orders";

/** Customer confirmed the PI: sent/negotiating → confirmed. No stock movement — batches come next. */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "approve_proforma_invoices");

  const from = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, id, companyId, ["sent", "negotiating"]);
    await tx
      .update(orders)
      .set({
        status: "confirmed",
        approvedBy: user.id,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedBy: null,
        rejectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));
    return order;
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PI_CONFIRMED,
    entityName: "Order",
    entityId: id,
    newValue: { from: from.status, revisionNumber: from.revisionNumber },
    meta,
  });
  return ok(await getOrderDetail(id, companyId));
});
