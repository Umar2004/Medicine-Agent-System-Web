import { eq } from "drizzle-orm";
import { createElement } from "react";
import { PackingList } from "@/components/pdf/PackingList";
import { db, invoices } from "@/db";
import { errors, handler, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getCompanyProfile } from "@/lib/company-profile";
import { resolveCompany } from "@/lib/company-context";
import { getPackingList, PACKING_READ_ROUTES } from "@/lib/packing-lists";
import { pdfResponse, renderPdf } from "@/lib/pdf";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/** Packing List PDF (A4 portrait). `?download=1` saves instead of opening. */
export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Packing list");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, PACKING_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const pl = await getPackingList(id, companyId);
  if (!pl) throw errors.notFound("Packing list");
  const [inv] = await db
    .select({
      name: invoices.consigneeName,
      address: invoices.consigneeAddress,
      country: invoices.consigneeCountry,
    })
    .from(invoices)
    .where(eq(invoices.id, pl.invoiceId));
  const company = await getCompanyProfile(pl.companyId);

  const pdf = await renderPdf(
    createElement(PackingList, {
      company,
      data: {
        invoiceNumber: pl.invoiceNumber,
        shipmentReference: pl.shipmentReference,
        date: pl.date,
        consignee: [inv?.name ?? null, inv?.address ?? null, inv?.country ?? null],
        totalCartons: pl.totalCartons,
        containerInfo: pl.containerInfo,
        grossWeightKg: pl.grossWeightKg,
        netWeightKg: pl.netWeightKg,
        cbm: pl.cbm,
        marks: pl.marks,
        items: pl.items,
      },
    }),
    { footerLabel: `Packing list · Invoice ${pl.invoiceNumber} · ${company.name}` },
  );
  return pdfResponse(pdf, `PackingList-${pl.invoiceNumber}.pdf`, req.nextUrl.searchParams.get("download") === "1");
});
