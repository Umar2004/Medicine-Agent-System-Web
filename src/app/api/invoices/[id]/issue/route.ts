import { eq } from "drizzle-orm";
import { db, invoices } from "@/db";
import { errors, handler, ok, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { invoiceResponse, lockInvoice } from "@/lib/invoice-actions";
import { requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { missingEnforcedSections } from "@/lib/validations";

/**
 * draft → issued. After this the invoice is read-only. Sections the source PI had OFF must be
 * completed first (section enforcement — see ENFORCED_SECTION_FIELDS).
 */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Invoice");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_invoices", { meta, companyId });

  await db.transaction(async (tx) => {
    const invoice = await lockInvoice(tx, id, companyId, ["draft"]);
    if (!invoice.consigneeName) throw errors.badRequest("Enter the consignee before issuing the invoice.");
    const missing = missingEnforcedSections(invoice.sectionEnforcement, invoice);
    if (missing.length) {
      throw errors.badRequest(
        `The proforma invoice left out these sections, so the invoice must include them: ${missing
          .map((m) => m.label)
          .join(", ")}.`,
        { missingEnforcedSections: missing },
      );
    }
    await tx.update(invoices).set({ status: "issued", updatedAt: new Date() }).where(eq(invoices.id, id));
  });

  auditLog({ user, companyId, actionType: ACTION_TYPES.INVOICE_ISSUED, entityName: "Invoice", entityId: id, meta });
  return ok(await invoiceResponse(id, companyId));
});
