import { handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail, transitionOrder } from "@/lib/orders";

/** Customer confirmed the PI: sent/negotiating → confirmed. No stock movement — batches come next. */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "approve_proforma_invoices");

  const now = new Date();
  const prev = await transitionOrder(id, companyId, ["sent", "negotiating"], {
    status: "confirmed",
    approvedBy: user.id,
    approvedAt: now,
    rejectionReason: null,
    rejectedBy: null,
    rejectedAt: null,
    updatedAt: now,
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PI_CONFIRMED,
    entityName: "Order",
    entityId: id,
    newValue: { from: prev.from, revisionNumber: prev.revisionNumber },
    meta,
  });
  return ok(await getOrderDetail(id, companyId));
});
