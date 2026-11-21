import { eq } from "drizzle-orm";
import { db, quotations } from "@/db";
import { handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getQuotationDetail, lockQuotation } from "@/lib/quotations";

/** Mark as sent to the customer: draft → sent (also re-sends a revised negotiating quotation). */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "manage_quotations", "Quotation");

  const from = await db.transaction(async (tx) => {
    const q = await lockQuotation(tx, id, companyId, ["draft", "negotiating"]);
    const now = new Date();
    await tx
      .update(quotations)
      .set({ status: "sent", sentAt: now, rejectionReason: null, rejectedBy: null, rejectedAt: null, updatedAt: now })
      .where(eq(quotations.id, id));
    return q;
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.QUOTATION_SENT,
    entityName: "Quotation",
    entityId: id,
    newValue: { from: from.status, revisionNumber: from.revisionNumber },
    meta,
  });
  return ok(await getQuotationDetail(id, companyId));
});
