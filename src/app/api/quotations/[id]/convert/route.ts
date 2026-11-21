import { db } from "@/db";
import { handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { NUMBER_CONSTRAINTS, withNumberRetry } from "@/lib/number-generator";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail } from "@/lib/orders";
import { convertQuotationToPI, getQuotationDetail, lockQuotation } from "@/lib/quotations";

/**
 * QT → PI: accepted → converted. Creates a draft proforma invoice (orders table) with the same
 * lines and all sections ON. Returns { quotation, order }.
 */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "manage_proforma_invoices", "Quotation");

  const created = await withNumberRetry(NUMBER_CONSTRAINTS.proforma, () =>
    db.transaction(async (tx) => {
      const quotation = await lockQuotation(tx, id, companyId, ["accepted"]);
      const result = await convertQuotationToPI(tx, quotation, user.id);
      return { ...result, quotationNumber: quotation.quotationNumber };
    }),
  );

  const [quotation, order] = await Promise.all([
    getQuotationDetail(id, companyId),
    getOrderDetail(created.orderId, companyId),
  ]);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.QUOTATION_CONVERTED,
    entityName: "Quotation",
    entityId: id,
    newValue: { orderId: created.orderId, orderNumber: created.orderNumber },
    meta,
  });
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PI_CREATED,
    entityName: "Order",
    entityId: created.orderId,
    newValue: { ...order, fromQuotation: created.quotationNumber },
    meta,
  });
  return ok({ quotation, order }, { status: 201 });
});
