import { eq } from "drizzle-orm";
import { db, quotationItems, quotations } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES, type QuotationStatus } from "@/lib/constants";
import { createRevisionSnapshot, summarizeItemChanges } from "@/lib/documents";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import {
  assertQuotationRefs,
  getQuotationDetail,
  insertQuotationItems,
  lockQuotation,
  QUOTATION_EDITABLE_STATUSES,
  QUOTATION_READ_ROUTES,
  quotationHeaderValues,
} from "@/lib/quotations";
import { getRequestMeta } from "@/lib/request-meta";
import { createQuotationSchema } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Quotation");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, QUOTATION_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const detail = await getQuotationDetail(id, companyId);
  if (!detail) throw errors.notFound("Quotation");
  return ok(detail);
});

/**
 * Status after an edit. Draft edits overwrite the current revision; edits once the customer has
 * seen it start a new revision — sent/negotiating/accepted → negotiating (so the customer must
 * re-accept), rejected → back to draft.
 */
const AFTER_EDIT: Record<string, { status: QuotationStatus; newRevision: boolean }> = {
  draft: { status: "draft", newRevision: false },
  sent: { status: "negotiating", newRevision: true },
  negotiating: { status: "negotiating", newRevision: true },
  rejected: { status: "draft", newRevision: true },
  accepted: { status: "negotiating", newRevision: true },
};

/** Edit — while draft, sent, negotiating, rejected or accepted. The customer can't be changed (it's in the number). */
export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Quotation");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_quotations", { meta, companyId });

  const input = await parseBody(req, createQuotationSchema);
  await assertQuotationRefs(companyId, input);
  const before = await getQuotationDetail(id, companyId);

  const revision = await db.transaction(async (tx) => {
    const q = await lockQuotation(tx, id, companyId, QUOTATION_EDITABLE_STATUSES);
    if (input.customerId !== q.customerId) {
      throw errors.conflict("The customer can't be changed. Create a new quotation for a different customer.");
    }
    const next = AFTER_EDIT[q.status];
    const oldItems = await tx.select().from(quotationItems).where(eq(quotationItems.quotationId, id));
    const revisionNumber = next.newRevision ? q.revisionNumber + 1 : q.revisionNumber;

    await tx
      .update(quotations)
      .set({ ...quotationHeaderValues(input), status: next.status, revisionNumber, updatedAt: new Date() })
      .where(eq(quotations.id, id));
    await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
    await insertQuotationItems(tx, id, input.items);

    const summary = next.newRevision ? summarizeItemChanges(oldItems, input.items) : "Draft updated";
    await createRevisionSnapshot(tx, "quotation", id, user.id, summary);
    return next.newRevision ? { revisionNumber, summary } : null;
  });

  const after = await getQuotationDetail(id, companyId);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.QUOTATION_UPDATED,
    entityName: "Quotation",
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
      entityName: "Quotation",
      entityId: id,
      newValue: revision,
      meta,
    });
  }
  return ok(after);
});

/** Soft delete — draft only. Sent quotations are rejected instead, so the history stays. */
export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Quotation");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_quotations", { meta, companyId });

  const before = await getQuotationDetail(id, companyId);
  await db.transaction(async (tx) => {
    await lockQuotation(tx, id, companyId, ["draft"]);
    await tx.update(quotations).set({ isDeleted: true, updatedAt: new Date() }).where(eq(quotations.id, id));
  });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.QUOTATION_DELETED,
    entityName: "Quotation",
    entityId: id,
    oldValue: before,
    meta,
  });
  return ok({ id });
});
