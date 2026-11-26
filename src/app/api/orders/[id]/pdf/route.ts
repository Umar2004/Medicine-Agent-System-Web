import { createElement } from "react";
import { ProformaInvoice, type ProformaData } from "@/components/pdf/ProformaInvoice";
import { errors, handler, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getCompanyProfile } from "@/lib/company-profile";
import { resolveCompany } from "@/lib/company-context";
import { toCents } from "@/lib/money";
import { usdAmountInWords } from "@/lib/number-to-words";
import { getOrderDetail, ORDER_READ_ROUTES } from "@/lib/orders";
import { documentPdfResponse } from "@/lib/pdf";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/** Proforma Invoice PDF (A4 landscape). Sections switched off on the PI are left out. `?download=1` saves. */
export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Order");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, ORDER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const order = await getOrderDetail(id, companyId);
  if (!order) throw errors.notFound("Order");

  // The proforma shows the PI lines: re-join lines that were split across batches.
  const lines = new Map<number, ProformaData["items"][number]>();
  for (const i of order.items) {
    const existing = lines.get(i.sortOrder);
    if (existing) {
      existing.quantity += i.quantity;
      existing.totalUsd += i.totalUsd;
    } else {
      lines.set(i.sortOrder, {
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
      });
    }
  }

  const company = await getCompanyProfile(order.companyId);
  return documentPdfResponse(
    req,
    createElement(ProformaInvoice, {
      company,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        customer: order.customer,
        items: [...lines.values()],
        showMfd: order.showMfd,
        showExp: order.showExp,
        showGenericName: order.showGenericName,
        showFreight: order.showFreight,
        showBankDetails: order.showBankDetails,
        showOtherDetails: order.showOtherDetails,
        airFreight: order.airFreight,
        handlingDocumentation: order.handlingDocumentation,
        totalCnf: order.totalCnf,
        amountInWords: usdAmountInWords(toCents(order.totalCnf)),
        cnfDestination: order.cnfDestination,
        paymentTerms: order.paymentTerms,
        marks: order.marks,
        notes: order.notes,
        bank: order.bank,
      },
    }),
    { landscape: true, footerLabel: `Proforma ${order.orderNumber} · ${company.name}`, filename: `Proforma-${order.orderNumber}.pdf` },
  );
});
