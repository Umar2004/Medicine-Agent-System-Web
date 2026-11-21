import { and, count, eq, isNull } from "drizzle-orm";
import { db, orderItems, orders } from "@/db";
import { errors, handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { createInvoiceFromOrder } from "@/lib/invoices";
import { NUMBER_CONSTRAINTS, withNumberRetry } from "@/lib/number-generator";
import { orderActionContext } from "@/lib/order-actions";
import { lockOrder } from "@/lib/orders";
import { copyPackingListToNewInvoice } from "@/lib/packing-lists";

/**
 * Finalize → draft Commercial Invoice (CLAUDE.md §7.2, §7.12).
 * Requires batch_assigned (the PI was necessarily sent and confirmed to get there).
 * Order → invoiced, document_type → commercial_invoice. Sections the PI had OFF are recorded as
 * enforced on the CI (see createInvoiceFromOrder). Cancelling the invoice reverts both.
 * Re-finalizing after a cancelled CI copies that CI's packing list onto the new one.
 */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "manage_invoices");

  const { invoice, packingList } = await withNumberRetry(NUMBER_CONSTRAINTS.invoice, () =>
    db.transaction(async (tx) => {
      const order = await lockOrder(tx, id, companyId, ["batch_assigned"]);
      const [{ missing }] = await tx
        .select({ missing: count() })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, id), isNull(orderItems.batchId)));
      if (missing > 0) throw errors.conflict("Every line needs a batch before finalizing.");

      const created = await createInvoiceFromOrder(tx, order, user.id);
      const copied = await copyPackingListToNewInvoice(tx, id, { ...created, companyId: order.companyId });
      await tx
        .update(orders)
        .set({ status: "invoiced", documentType: "commercial_invoice", updatedAt: new Date() })
        .where(eq(orders.id, id));
      return { invoice: created, packingList: copied };
    }),
  );

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.INVOICE_CREATED,
    entityName: "Invoice",
    entityId: invoice.id,
    newValue: { invoiceNumber: invoice.invoiceNumber, orderId: id, sectionEnforcement: invoice.sectionEnforcement },
    meta,
  });
  if (packingList) {
    auditLog({
      user,
      companyId,
      actionType: ACTION_TYPES.PACKING_LIST_CREATED,
      entityName: "PackingList",
      entityId: packingList.id,
      newValue: { invoiceId: invoice.id, copiedFromInvoice: packingList.fromInvoiceNumber },
      meta,
    });
  }
  return ok({ ...invoice, packingListCopiedFrom: packingList?.fromInvoiceNumber ?? null }, { status: 201 });
});
