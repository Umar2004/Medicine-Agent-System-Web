import { handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail, transitionOrder } from "@/lib/orders";

/** PI sent to the customer: draft → sent (also re-sends a revised negotiating PI). Replaces "mark as sent". */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "manage_proforma_invoices");

  const now = new Date();
  const prev = await transitionOrder(id, companyId, ["draft", "negotiating"], {
    status: "sent",
    sentAt: now,
    rejectionReason: null,
    rejectedBy: null,
    rejectedAt: null,
    updatedAt: now,
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PI_SENT,
    entityName: "Order",
    entityId: id,
    newValue: { from: prev.from, revisionNumber: prev.revisionNumber },
    meta,
  });
  return ok(await getOrderDetail(id, companyId));
});
