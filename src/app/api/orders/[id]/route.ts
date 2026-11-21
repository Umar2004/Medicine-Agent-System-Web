import { and, eq } from "drizzle-orm";
import { db, orderItems, orders, quotations } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES, type OrderStatus } from "@/lib/constants";
import { createRevisionSnapshot, summarizeItemChanges } from "@/lib/documents";
import {
  assertOrderRefs,
  getOrderDetail,
  insertOrderItems,
  lockOrder,
  ORDER_EDITABLE_STATUSES,
  ORDER_READ_ROUTES,
  orderHeaderValues,
} from "@/lib/orders";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { createProformaSchema } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Order");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, ORDER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const detail = await getOrderDetail(id, companyId);
  if (!detail) throw errors.notFound("Order");
  return ok(detail);
});

/**
 * Status after an edit. Draft edits overwrite the current revision; once the customer has seen
 * the PI, an edit starts a new revision and the PI is in negotiation. Editing a confirmed PI voids
 * the confirmation — the customer has to confirm the new revision.
 */
const AFTER_EDIT: Partial<Record<OrderStatus, { status: OrderStatus; newRevision: boolean }>> = {
  draft: { status: "draft", newRevision: false },
  sent: { status: "negotiating", newRevision: true },
  negotiating: { status: "negotiating", newRevision: true },
  confirmed: { status: "negotiating", newRevision: true },
};

/** Edit a PI — while draft, sent, negotiating or confirmed. The customer can't change (its code is in the number). */
export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Order");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_proforma_invoices", { meta, companyId });

  const input = await parseBody(req, createProformaSchema);
  await assertOrderRefs(companyId, input);
  const before = await getOrderDetail(id, companyId);

  const revision = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, id, companyId, ORDER_EDITABLE_STATUSES);
    if (input.customerId !== order.customerId) {
      throw errors.conflict("The customer can't be changed. Create a new proforma invoice for a different customer.");
    }
    const next = AFTER_EDIT[order.status as OrderStatus]!;
    const oldItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    const revisionNumber = next.newRevision ? order.revisionNumber + 1 : order.revisionNumber;

    const voidConfirmation = order.status === "confirmed" ? { approvedBy: null, approvedAt: null } : {};
    await tx
      .update(orders)
      .set({ ...orderHeaderValues(input), ...voidConfirmation, status: next.status, revisionNumber, updatedAt: new Date() })
      .where(eq(orders.id, id));
    await tx.delete(orderItems).where(eq(orderItems.orderId, id));
    await insertOrderItems(tx, id, input.items);

    const summary = next.newRevision ? summarizeItemChanges(oldItems, input.items) : "Draft updated";
    await createRevisionSnapshot(tx, "proforma_invoice", id, user.id, summary);
    return next.newRevision ? { revisionNumber, summary } : null;
  });

  const after = await getOrderDetail(id, companyId);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PI_UPDATED,
    entityName: "Order",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  if (revision) {
    auditLog({
      user,
      companyId,
      actionType: ACTION_TYPES.REVISION_CREATED,
      entityName: "Order",
      entityId: id,
      newValue: revision,
      meta,
    });
  }
  return ok(after);
});

/**
 * Soft delete — draft only (sent PIs are cancelled instead, so the history stays). If the PI came
 * from a quotation, that quotation goes back to "accepted" so it can be converted again.
 */
export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Order");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_proforma_invoices", { meta, companyId });

  const before = await getOrderDetail(id, companyId);
  const reopened = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, id, companyId, ["draft"]);
    await tx.update(orders).set({ isDeleted: true, updatedAt: new Date() }).where(eq(orders.id, id));
    if (!order.convertedFromQuotationId) return null;
    const [q] = await tx
      .update(quotations)
      .set({ status: "accepted", convertedToOrderId: null, convertedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(quotations.id, order.convertedFromQuotationId),
          eq(quotations.companyId, companyId),
          eq(quotations.convertedToOrderId, id),
        ),
      )
      .returning({ id: quotations.id, quotationNumber: quotations.quotationNumber });
    return q ?? null;
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PI_DELETED,
    entityName: "Order",
    entityId: id,
    oldValue: before,
    newValue: reopened ? { quotationReopened: reopened } : undefined,
    meta,
  });
  return ok({ id, quotationReopened: reopened });
});
