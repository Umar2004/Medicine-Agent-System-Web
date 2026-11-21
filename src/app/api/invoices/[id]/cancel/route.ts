import { and, eq, inArray, sql } from "drizzle-orm";
import { db, invoices, orders } from "@/db";
import { handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { invoiceResponse, lockInvoice } from "@/lib/invoice-actions";
import { requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { invoiceCancelSchema } from "@/lib/validations";

/**
 * Cancel (CLAUDE.md §7.5): the order returns to batch_assigned and is a proforma_invoice again;
 * stock stays deducted and batches stay assigned. Stock only comes back via "Undo batch
 * assignment" on the order. A re-finalize creates a new CI with a new number (§7.13).
 */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Invoice");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_invoices", { meta, companyId });
  const { reason } = await parseBody(req, invoiceCancelSchema);

  const orderId = await db.transaction(async (tx) => {
    const invoice = await lockInvoice(tx, id, companyId, ["draft", "issued"]);
    await tx
      .update(invoices)
      .set({
        status: "cancelled",
        notes: sql`concat_ws(E'\n', ${invoices.notes}, ${`Cancelled: ${reason}`}::text)`,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id));
    if (invoice.orderId) {
      await tx
        .update(orders)
        .set({ status: "batch_assigned", documentType: "proforma_invoice", updatedAt: new Date() })
        .where(and(eq(orders.id, invoice.orderId), inArray(orders.status, ["invoiced", "completed"])));
    }
    return invoice.orderId;
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.INVOICE_CANCELLED,
    entityName: "Invoice",
    entityId: id,
    newValue: { reason, orderId },
    meta,
  });
  return ok(await invoiceResponse(id, companyId));
});
