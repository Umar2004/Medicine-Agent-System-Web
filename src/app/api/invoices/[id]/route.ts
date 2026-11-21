import { and, eq } from "drizzle-orm";
import { companyBankDetails, db, invoices, signatures } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { invoiceResponse, lockInvoice } from "@/lib/invoice-actions";
import { getInvoiceDetail, INVOICE_READ_ROUTES } from "@/lib/invoices";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { emptyToNull, invoiceUpdateSchema } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Invoice");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, INVOICE_READ_ROUTES, { meta: getRequestMeta(req), companyId });
  return ok(await invoiceResponse(id, companyId));
});

/**
 * Parties, signature, bank and print fields — draft only. Items never change (CLAUDE.md §7.12–7.13).
 * Section enforcement: a Commercial Invoice always shows every section, so there is nothing to
 * toggle off. Enforced sections (OFF on the PI) may be saved incomplete while drafting; the
 * response lists them in `missingEnforcedSections`, and issuing is blocked until they're filled.
 */
export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Invoice");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_invoices", { meta, companyId });

  const input = await parseBody(req, invoiceUpdateSchema);
  const bankDetailId = emptyToNull(input.bankDetailId);
  const signatureId = emptyToNull(input.signatureId);
  if (bankDetailId) {
    const [bank] = await db
      .select({ id: companyBankDetails.id })
      .from(companyBankDetails)
      .where(and(eq(companyBankDetails.id, bankDetailId), eq(companyBankDetails.companyId, companyId)))
      .limit(1);
    if (!bank) throw errors.badRequest("Selected bank account does not belong to this company");
  }
  if (signatureId) {
    const [sig] = await db
      .select({ userId: signatures.userId })
      .from(signatures)
      .where(and(eq(signatures.id, signatureId), eq(signatures.companyId, companyId), eq(signatures.isDeleted, false)))
      .limit(1);
    // Users sign with their own signatures (CLAUDE.md §6).
    if (!sig || sig.userId !== user.id) throw errors.badRequest("Pick one of your own signatures");
  }

  const before = await getInvoiceDetail(id, companyId);
  await db.transaction(async (tx) => {
    const current = await lockInvoice(tx, id, companyId, ["draft"]);
    // Keep someone else's already-chosen signature unless it is being changed.
    const keepSignature = signatureId === current.signatureId;
    await tx
      .update(invoices)
      .set({
        consigneeName: emptyToNull(input.consigneeName),
        consigneeAddress: emptyToNull(input.consigneeAddress),
        consigneeCountry: emptyToNull(input.consigneeCountry),
        consigneePhone: emptyToNull(input.consigneePhone),
        consigneeEmail: emptyToNull(input.consigneeEmail),
        notifyName: emptyToNull(input.notifyName),
        notifyAddress: emptyToNull(input.notifyAddress),
        notifyCountry: emptyToNull(input.notifyCountry),
        notifyPhone: emptyToNull(input.notifyPhone),
        notifyContactPerson: emptyToNull(input.notifyContactPerson),
        orderingName: emptyToNull(input.orderingName),
        orderingAddress: emptyToNull(input.orderingAddress),
        orderingCountry: emptyToNull(input.orderingCountry),
        orderingPhone: emptyToNull(input.orderingPhone),
        cnfDestination: emptyToNull(input.cnfDestination),
        marks: emptyToNull(input.marks),
        paymentTerms: emptyToNull(input.paymentTerms),
        notes: emptyToNull(input.notes),
        bankDetailId,
        signatureId: keepSignature ? current.signatureId : signatureId,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id));
  });

  const after = await invoiceResponse(id, companyId);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.INVOICE_UPDATED,
    entityName: "Invoice",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  return ok(after);
});
