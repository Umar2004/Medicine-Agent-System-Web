"use client";

import { DocumentWizard, type ExistingDocument } from "@/components/forms/DocumentWizard";
import type { QuotationDetail } from "@/types/entities";

function toExisting(q: QuotationDetail): ExistingDocument {
  return {
    id: q.id,
    number: q.quotationNumber,
    companyName: q.companyName,
    status: q.status,
    revisionNumber: q.revisionNumber,
    products: q.items.map((i) => ({
      id: i.productId,
      productNumber: i.productNumber,
      brandName: i.brandName,
      genericName: i.genericName,
      manufacturerName: i.manufacturerName,
      unit: i.unit,
    })),
    values: {
      customerId: q.customer.id,
      items: q.items.map((i) => ({
        productId: i.productId,
        mfd: i.mfd ?? "",
        exp: i.exp ?? "",
        quantity: i.quantity,
        unit: i.unit ?? "",
        sellingPriceUsd: i.sellingPriceUsd,
      })),
      airFreight: q.airFreight,
      handlingDocumentation: q.handlingDocumentation,
      cnfDestination: q.cnfDestination ?? "",
      marks: q.marks ?? "",
      paymentTerms: q.paymentTerms ?? "",
      notes: q.notes ?? "",
      bankDetailId: q.bankDetailId ?? "",
      showMfd: q.showMfd,
      showExp: q.showExp,
      showGenericName: q.showGenericName,
      showFreight: q.showFreight,
      showBankDetails: q.showBankDetails,
      showOtherDetails: q.showOtherDetails,
    },
  };
}

/** Quotation create/edit — sections (freight, bank, other details) start OFF. POSTs to /api/quotations. */
export function QuotationWizard({ quotation }: { /** Present → edit mode. */ quotation?: QuotationDetail }) {
  return <DocumentWizard mode="quotation" existing={quotation ? toExisting(quotation) : undefined} />;
}
