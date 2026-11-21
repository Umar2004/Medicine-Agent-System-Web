import { eq } from "drizzle-orm";
import { db, quotations } from "@/db";
import { handler, ok, parseBody } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getQuotationDetail, lockQuotation } from "@/lib/quotations";
import { rejectQuotationSchema } from "@/lib/validations";

/**
 * Customer declined, with a reason: sent/negotiating → rejected. A rejected quotation can be
 * edited, which returns it to draft.
 */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "approve_quotations", "Quotation");
  const { reason } = await parseBody(req, rejectQuotationSchema);

  const from = await db.transaction(async (tx) => {
    const q = await lockQuotation(tx, id, companyId, ["sent", "negotiating"]);
    await tx
      .update(quotations)
      .set({
        status: "rejected",
        rejectionReason: reason,
        rejectedBy: user.id,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quotations.id, id));
    return q;
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.QUOTATION_REJECTED,
    entityName: "Quotation",
    entityId: id,
    newValue: { from: from.status, to: "rejected", reason },
    meta,
  });
  return ok(await getQuotationDetail(id, companyId));
});
