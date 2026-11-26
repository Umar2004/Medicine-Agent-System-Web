import { createElement } from "react";
import { QuotationPdf } from "@/components/pdf/QuotationPdf";
import { errors, handler, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getCompanyProfile } from "@/lib/company-profile";
import { resolveCompany } from "@/lib/company-context";
import { toCents } from "@/lib/money";
import { usdAmountInWords } from "@/lib/number-to-words";
import { documentPdfResponse } from "@/lib/pdf";
import { requireAnyModule } from "@/lib/permissions";
import { getQuotationDetail, QUOTATION_READ_ROUTES } from "@/lib/quotations";
import { getRequestMeta } from "@/lib/request-meta";

/** Quotation PDF (A4 landscape). Sections switched off on the quotation are left out. `?download=1` saves. */
export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Quotation");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, QUOTATION_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const q = await getQuotationDetail(id, companyId);
  if (!q) throw errors.notFound("Quotation");

  const company = await getCompanyProfile(q.companyId);
  return documentPdfResponse(
    req,
    createElement(QuotationPdf, {
      company,
      data: {
        orderNumber: q.quotationNumber,
        status: q.status,
        createdAt: q.createdAt,
        customer: q.customer,
        items: q.items.map((i) => ({
          brandName: i.brandName,
          genericName: i.genericName,
          manufacturerName: i.manufacturerName,
          country: i.country,
          unit: i.unit,
          mfd: i.mfd,
          exp: i.exp,
          quantity: i.quantity,
          sellingPriceUsd: i.sellingPriceUsd,
          totalUsd: i.totalUsd,
        })),
        showMfd: q.showMfd,
        showExp: q.showExp,
        showGenericName: q.showGenericName,
        showFreight: q.showFreight,
        showBankDetails: q.showBankDetails,
        showOtherDetails: q.showOtherDetails,
        airFreight: q.airFreight,
        handlingDocumentation: q.handlingDocumentation,
        totalCnf: q.totalCnf, // already excludes freight when the section is off
        amountInWords: usdAmountInWords(toCents(q.totalCnf)),
        cnfDestination: q.cnfDestination,
        paymentTerms: q.paymentTerms,
        marks: q.marks,
        notes: q.notes,
        bank: q.bank,
      },
    }),
    { landscape: true, footerLabel: `Quotation ${q.quotationNumber} · ${company.name}`, filename: `Quotation-${q.quotationNumber}.pdf` },
  );
});
