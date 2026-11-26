import { and, eq } from "drizzle-orm";
import { createElement } from "react";
import { CommercialInvoice } from "@/components/pdf/CommercialInvoice";
import { customers, db, orders, signatures } from "@/db";
import { errors, handler, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getCompanyProfile, imageDataUri } from "@/lib/company-profile";
import { resolveCompany } from "@/lib/company-context";
import { invoicePartiesForOrder } from "@/lib/invoices";
import { lineTotalCents, toCents } from "@/lib/money";
import { usdAmountInWords } from "@/lib/number-to-words";
import { getOrderDetail, ORDER_READ_ROUTES } from "@/lib/orders";
import { documentPdfResponse } from "@/lib/pdf";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/**
 * Pre-invoice preview (A4 landscape): what the Commercial Invoice will look like for a batch-assigned PI —
 * assigned batches with their MFD/EXP, parties resolved exactly as finalize will, bank and e-signature from the
 * PI — watermarked PREVIEW. Nothing is created. `?download=1` saves.
 */
export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Order");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, ORDER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const [detail, [row]] = await Promise.all([
    getOrderDetail(id, companyId),
    db
      .select({ order: orders, customer: customers })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(and(eq(orders.id, id), eq(orders.isDeleted, false), companyId ? eq(orders.companyId, companyId) : undefined))
      .limit(1),
  ]);
  if (!detail || !row) throw errors.notFound("Order");
  if (detail.status !== "batch_assigned") {
    throw errors.conflict("The invoice preview is available once batches are assigned and before the invoice is created.");
  }

  const [company, parties, signature] = await Promise.all([
    getCompanyProfile(detail.companyId),
    invoicePartiesForOrder(db, row.order, row.customer),
    row.order.signatureId
      ? db
          .select({ label: signatures.label, imageUrl: signatures.imageUrl })
          .from(signatures)
          .where(eq(signatures.id, row.order.signatureId))
          .then(async ([s]) => (s ? { label: s.label, dataUri: await imageDataUri(s.imageUrl) } : null))
      : Promise.resolve(null),
  ]);

  // Same totals as finalize: freight always counts on the CI, whatever the PI showed.
  const goodsCents = detail.items.reduce((sum, i) => sum + lineTotalCents(i.quantity, i.sellingPriceUsd), 0);
  const totalCents = goodsCents + toCents(detail.airFreight) + toCents(detail.handlingDocumentation);

  return documentPdfResponse(
    req,
    createElement(CommercialInvoice, {
      company,
      data: {
        invoiceNumber: "Assigned on creation",
        proformaNumber: detail.orderNumber,
        status: "draft",
        watermark: "PREVIEW",
        createdAt: new Date(),
        cnfDestination: detail.cnfDestination,
        paymentTerms: detail.paymentTerms,
        marks: detail.marks,
        notes: detail.notes,
        consignee: [parties.consigneeName, parties.consigneeAddress, parties.consigneeCountry, parties.consigneePhone, parties.consigneeEmail],
        notify: [
          parties.notifyName,
          parties.notifyContactPerson ? `Attn: ${parties.notifyContactPerson}` : null,
          parties.notifyAddress,
          parties.notifyCountry,
          parties.notifyPhone,
        ],
        ordering: [parties.orderingName, parties.orderingAddress, parties.orderingCountry, parties.orderingPhone],
        // MFD/EXP from the assigned batch (§7.8), as on the real invoice.
        items: detail.items.map((i) => ({
          productId: i.productId,
          brandName: i.brandName,
          genericName: i.genericName,
          unit: i.unit,
          country: i.country,
          manufacturerName: i.manufacturerName,
          batchNumber: i.batchNumber,
          mfd: i.batchMfd ?? i.mfd,
          exp: i.batchExp ?? i.exp,
          quantity: i.quantity,
          sellingPriceUsd: i.sellingPriceUsd,
          lineTotal: lineTotalCents(i.quantity, i.sellingPriceUsd) / 100,
        })),
        showGenericName: detail.showGenericName,
        airFreight: detail.airFreight,
        handlingDocumentation: detail.handlingDocumentation,
        totalAmountUsd: totalCents / 100,
        amountInWords: usdAmountInWords(totalCents),
        bank: detail.bank,
        signature,
      },
    }),
    {
      landscape: true,
      footerLabel: `Invoice preview · ${detail.orderNumber} · ${company.name}`,
      filename: `Invoice-preview-${detail.orderNumber}.pdf`,
    },
  );
});
