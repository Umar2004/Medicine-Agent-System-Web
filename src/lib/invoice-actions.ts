import "server-only";
import { and, eq } from "drizzle-orm";
import { invoices, type Transaction } from "@/db";
import { errors } from "@/lib/api";
import type { InvoiceStatus } from "@/lib/constants";
import { signedUrl } from "@/lib/supabase-storage";
import { getInvoiceDetail } from "@/lib/invoices";
import { missingEnforcedSections } from "@/lib/validations";

export async function lockInvoice(tx: Transaction, id: string, companyId: string, allowed: InvoiceStatus[]) {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId), eq(invoices.isDeleted, false)))
    .for("update")
    .limit(1);
  if (!invoice) throw errors.notFound("Invoice");
  if (!allowed.includes(invoice.status)) throw errors.conflict(`Not allowed while the invoice is ${invoice.status}.`);
  return invoice;
}

/**
 * Invoice detail with a short-lived URL for the signature image, plus the enforced sections
 * (ones the source PI had OFF) that are still incomplete — these block issuing.
 */
export async function invoiceResponse(id: string, companyId: string | null) {
  const detail = await getInvoiceDetail(id, companyId);
  if (!detail) throw errors.notFound("Invoice");
  const signatureUrl = detail.signature ? await signedUrl(detail.signature.imageUrl).catch(() => null) : null;
  return {
    ...detail,
    signature: detail.signature ? { ...detail.signature, url: signatureUrl } : null,
    missingEnforcedSections: missingEnforcedSections(detail.sectionEnforcement, detail),
  };
}

