"use client";

import { DocumentWizard, type ExistingDocument } from "@/components/forms/DocumentWizard";
import type { OrderDetail } from "@/types/entities";

function toExisting(o: OrderDetail): ExistingDocument {
  return {
    id: o.id,
    number: o.orderNumber,
    companyName: o.companyName,
    status: o.status,
    revisionNumber: o.revisionNumber,
    products: o.items.map((i) => ({
      id: i.productId,
      productNumber: i.productNumber,
      brandName: i.brandName,
      genericName: i.genericName,
      manufacturerName: i.manufacturerName,
      unit: i.unit,
    })),
    values: {
      customerId: o.customer.id,
      // Editable only before batches are assigned, so there are no batch-split lines here.
      items: o.items.map((i) => ({
        productId: i.productId,
        mfd: i.mfd ?? "",
        exp: i.exp ?? "",
        quantity: i.quantity,
        unit: i.unit ?? "",
        sellingPriceUsd: i.sellingPriceUsd,
      })),
      airFreight: o.airFreight,
      handlingDocumentation: o.handlingDocumentation,
      cnfDestination: o.cnfDestination ?? "",
      marks: o.marks ?? "",
      paymentTerms: o.paymentTerms ?? "",
      notes: o.notes ?? "",
      bankDetailId: o.bankDetailId ?? "",
      showMfd: o.showMfd,
      showExp: o.showExp,
      showGenericName: o.showGenericName,
      showFreight: o.showFreight,
      showBankDetails: o.showBankDetails,
      showOtherDetails: o.showOtherDetails,
      // Party & signature fields (optional on PI)
      consigneeName: o.consigneeName ?? "",
      consigneeAddress: o.consigneeAddress ?? "",
      consigneeCountry: o.consigneeCountry ?? "",
      consigneePhone: o.consigneePhone ?? "",
      consigneeEmail: o.consigneeEmail ?? "",
      notifyName: o.notifyName ?? "",
      notifyAddress: o.notifyAddress ?? "",
      notifyCountry: o.notifyCountry ?? "",
      notifyPhone: o.notifyPhone ?? "",
      notifyContactPerson: o.notifyContactPerson ?? "",
      orderingName: o.orderingName ?? "",
      orderingAddress: o.orderingAddress ?? "",
      orderingCountry: o.orderingCountry ?? "",
      orderingPhone: o.orderingPhone ?? "",
      signatureId: o.signatureId ?? "",
    },
  };
}

/** Proforma invoice create/edit — sections (freight, bank, other details) start ON. POSTs to /api/orders. */
export function ProformaWizard({ order }: { /** Present → edit mode. */ order?: OrderDetail }) {
  return <DocumentWizard mode="proforma" existing={order ? toExisting(order) : undefined} />;
}
