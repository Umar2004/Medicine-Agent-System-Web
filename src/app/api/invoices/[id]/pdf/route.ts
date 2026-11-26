import { createElement } from "react";
import { CommercialInvoice } from "@/components/pdf/CommercialInvoice";
import { errors, handler, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getCompanyProfile, imageDataUri } from "@/lib/company-profile";
import { resolveCompany } from "@/lib/company-context";
import { getInvoiceDetail, INVOICE_READ_ROUTES } from "@/lib/invoices";
import { toCents } from "@/lib/money";
import { usdAmountInWords } from "@/lib/number-to-words";
import { documentPdfResponse } from "@/lib/pdf";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/** Commercial Invoice PDF (A4 landscape). All sections always printed. Drafts/cancelled carry a watermark. `?download=1` saves. */
export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Invoice");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, INVOICE_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const inv = await getInvoiceDetail(id, companyId);
  if (!inv) throw errors.notFound("Invoice");

  const [company, signatureUri] = await Promise.all([
    getCompanyProfile(inv.companyId),
    inv.signature ? imageDataUri(inv.signature.imageUrl) : Promise.resolve(null),
  ]);

  return documentPdfResponse(
    req,
    createElement(CommercialInvoice, {
      company,
      data: {
        invoiceNumber: inv.invoiceNumber,
        proformaNumber: inv.orderNumber,
        status: inv.status,
        createdAt: inv.createdAt,
        cnfDestination: inv.cnfDestination,
        paymentTerms: inv.paymentTerms,
        marks: inv.marks,
        notes: inv.notes,
        consignee: [inv.consigneeName, inv.consigneeAddress, inv.consigneeCountry, inv.consigneePhone, inv.consigneeEmail],
        notify: [
          inv.notifyName,
          inv.notifyContactPerson ? `Attn: ${inv.notifyContactPerson}` : null,
          inv.notifyAddress,
          inv.notifyCountry,
          inv.notifyPhone,
        ],
        ordering: [inv.orderingName, inv.orderingAddress, inv.orderingCountry, inv.orderingPhone],
        items: inv.items,
        showGenericName: inv.showGenericName,
        airFreight: inv.airFreight,
        handlingDocumentation: inv.handlingDocumentation,
        totalAmountUsd: inv.totalAmountUsd,
        // Imported legacy invoices have no stored wording.
        amountInWords: inv.amountInWords ?? usdAmountInWords(toCents(inv.totalAmountUsd)),
        bank: inv.bank,
        signature: inv.signature ? { label: inv.signature.label, dataUri: signatureUri } : null,
      },
    }),
    { landscape: true, footerLabel: `Invoice ${inv.invoiceNumber} · ${company.name}`, filename: `Invoice-${inv.invoiceNumber}.pdf` },
  );
});
