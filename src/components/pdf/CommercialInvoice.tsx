/* eslint-disable @next/next/no-img-element -- print template rendered to static HTML for headless Chrome, not a Next.js page */
import {
  BankDetails,
  Box,
  CompanyHeader,
  docDate,
  Lines,
  money,
  PdfDocument,
  type BankBlock,
} from "@/components/pdf/PdfLayout";
import { QTY_LABEL } from "@/components/pdf/ProformaInvoice";
import type { CompanyProfile } from "@/lib/company-profile";
import { cnfTotalLabel, SHIPPING_MODE, TOTAL_LABELS } from "@/lib/constants";
import { monYY } from "@/lib/format";

/** Printed heading (confirmed by the client: "INVOICE"; internally the document type stays commercial_invoice). */
export const COMMERCIAL_INVOICE_TITLE = "INVOICE";

export interface CommercialInvoiceData {
  invoiceNumber: string;
  /** Source proforma invoice number, printed as a reference. */
  proformaNumber: string | null;
  status: "draft" | "issued" | "cancelled";
  createdAt: Date | string;
  cnfDestination: string | null;
  paymentTerms: string | null;
  marks: string | null;
  notes: string | null;
  consignee: (string | null)[];
  notify: (string | null)[];
  ordering: (string | null)[];
  /** In print order (sort_order); a line split across batches gives consecutive rows of one product. */
  items: {
    productId: string;
    brandName: string;
    genericName: string | null;
    unit: string | null;
    country: string | null;
    manufacturerName: string | null;
    batchNumber: string | null;
    mfd: string | null;
    exp: string | null;
    quantity: number;
    sellingPriceUsd: number;
    lineTotal: number;
  }[];
  airFreight: number;
  handlingDocumentation: number;
  totalAmountUsd: number;
  amountInWords: string | null;
  showGenericName: boolean;
  bank: BankBlock | null;
  signature: { label: string; dataUri: string | null } | null;
  /** Overrides the status watermark (the pre-invoice preview prints "PREVIEW"). */
  watermark?: string;
}

/**
 * A4 landscape Commercial Invoice (CLAUDE.md §10). One product may span several rows (one per
 * batch); MFD/EXP come from the assigned batch; signature bottom-right. Unlike quotations and PIs,
 * every section is always printed — sections the PI left out are enforced here.
 */
export function CommercialInvoice({
  company,
  data,
}: {
  company: CompanyProfile;
  data: CommercialInvoiceData;
}) {
  // Consecutive rows of the same product (one per batch) share one SL No, printed on the first row.
  const groups: { seq: number; items: CommercialInvoiceData["items"] }[] = [];
  for (const item of data.items) {
    const last = groups.at(-1);
    if (last && last.items[0].productId === item.productId)
      last.items.push(item);
    else groups.push({ seq: groups.length + 1, items: [item] });
  }
  const goods = data.items.reduce((s, i) => s + i.lineTotal, 0);
  const charges = data.airFreight + data.handlingDocumentation;
  const watermark =
    data.watermark ??
    (data.status === "draft"
      ? "DRAFT"
      : data.status === "cancelled"
        ? "CANCELLED"
        : null);
  return (
    <PdfDocument title={`Invoice ${data.invoiceNumber}`} watermark={watermark}>
      <CompanyHeader
        company={company}
        title={COMMERCIAL_INVOICE_TITLE}
        rows={[
          ["Invoice No:", data.invoiceNumber],
          ["Date:", docDate(data.createdAt)],
          ...(data.proformaNumber
            ? ([["PI Ref:", data.proformaNumber]] as [string, string][])
            : []),
          ...(company.taxId
            ? ([["TIN:", company.taxId]] as [string, string][])
            : []),
          ["Shipment:", SHIPPING_MODE.toUpperCase()],
        ]}
      />

      <div className="grid2">
        <div className="stack">
          {data.ordering.some(Boolean) && (
            <Box title="Ordering party">
              <Lines values={data.ordering} />
            </Box>
          )}
          <BankDetails bank={data.bank} />
          <Box title="Terms">
            <p>Payment terms: {data.paymentTerms || "—"}</p>
            <p>Marks: {data.marks || "—"}</p>
          </Box>
        </div>
        <div className="stack">
          <Box title="Consignee">
            <Lines values={data.consignee} />
          </Box>
          <Box title="Notify party">
            <Lines values={data.notify} />
          </Box>
        </div>
      </div>

      <table className="items">
        <thead>
          <tr>
            <th className="center">SL No</th>
            <th>Brand name{data.showGenericName ? " / Generic name" : ""}</th>
            <th>Unit</th>
            <th>Country</th>
            <th>MNF</th>
            <th>Batch No</th>
            <th>MNF Date</th>
            <th>EXP Date</th>
            <th className="num">Qty</th>
            <th className="num">Rate US$</th>
            <th className="num">Total US$</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((group) =>
            group.items.map((item, j) => (
              <tr key={`${group.seq}-${j}`}>
                <td className="center">
                  {j === 0 ? String(group.seq).padStart(2, "0") : ""}
                </td>
                <td>
                  <strong>{item.brandName}</strong>
                  {data.showGenericName && item.genericName && (
                    <div className="generic">{item.genericName}</div>
                  )}
                </td>
                <td className="nowrap">{item.unit ?? ""}</td>
                <td>{item.country ?? ""}</td>
                <td>{item.manufacturerName ?? ""}</td>
                <td className="nowrap">{item.batchNumber ?? ""}</td>
                <td className="nowrap">{monYY(item.mfd)}</td>
                <td className="nowrap">{monYY(item.exp)}</td>
                <td className="num">
                  {item.quantity.toLocaleString("en-US")} {QTY_LABEL}
                </td>
                <td className="num">{money(item.sellingPriceUsd)}</td>
                <td className="num">{money(item.lineTotal)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      <table className="totals">
        <tbody>
          <tr>
            <td>{TOTAL_LABELS.subTotal} (US$)</td>
            <td className="num">{money(goods)}</td>
          </tr>
          <tr>
            <td>{TOTAL_LABELS.charges} (US$)</td>
            <td className="num">{money(charges)}</td>
          </tr>
          <tr className="grand">
            <td>{cnfTotalLabel(data.cnfDestination)} (US$)</td>
            <td className="num">{money(data.totalAmountUsd)}</td>
          </tr>
        </tbody>
      </table>
      {data.amountInWords && <p className="words">{data.amountInWords}</p>}
      <Box title="Notes">
        <p className="pre">{data.notes || "—"}</p>
      </Box>

      <div className="footer-row">
        <div className="muted">Date: {docDate(data.createdAt)}</div>
        <div className="signature">
          {data.signature?.dataUri && (
            <img src={data.signature.dataUri} alt="" />
          )}
          <div className="sig-line">
            {data.signature ? data.signature.label : "Authorised signature"} —
            For {company.name}
          </div>
        </div>
      </div>
    </PdfDocument>
  );
}
