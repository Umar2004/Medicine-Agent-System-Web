import { BankDetails, Box, CompanyHeader, docDate, Lines, money, PdfDocument, type BankBlock } from "@/components/pdf/PdfLayout";
import type { CompanyProfile } from "@/lib/company-profile";
import { cnfTotalLabel, SHIPPING_MODE, TOTAL_LABELS } from "@/lib/constants";
import { monYY } from "@/lib/format";

/** Quantity column label (CLAUDE.md §10: "984 Packs"); the UNIT column holds the pack size. */
export const QTY_LABEL = "Packs";

/** Data for a price document — a quotation or a proforma invoice. Neither shows batches. */
export interface ProformaData {
  /** QT-SFL-0001 or PI-SFL-0001. */
  orderNumber: string;
  status: string;
  createdAt: Date | string;
  customer: {
    name: string;
    businessName: string | null;
    contactPerson: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
  };
  items: {
    brandName: string;
    genericName: string | null;
    manufacturerName: string | null;
    country: string | null;
    unit: string | null;
    mfd: string | null;
    exp: string | null;
    quantity: number;
    sellingPriceUsd: number;
    totalUsd: number;
  }[];
  showMfd: boolean;
  showExp: boolean;
  showGenericName: boolean;
  /** Optional sections — each OFF section is left out of the PDF entirely. */
  showFreight: boolean;
  showBankDetails: boolean;
  showOtherDetails: boolean;
  airFreight: number;
  handlingDocumentation: number;
  /** Already excludes freight when the freight section is off. */
  totalCnf: number;
  amountInWords: string;
  cnfDestination: string | null;
  paymentTerms: string | null;
  marks: string | null;
  notes: string | null;
  bank: BankBlock | null;
}

const KINDS = {
  quotation: {
    heading: "QUOTATION",
    docTitle: "Quotation",
    closing: "This quotation is an offer only and is not an invoice. Prices are subject to confirmation.",
    signature: false,
  },
  proforma: {
    heading: "PROFORMA INVOICE",
    docTitle: "Proforma",
    closing: "Thank you for your business. This proforma invoice is not a final invoice.",
    signature: true,
  },
} as const;

/**
 * A4 landscape price document shared by the Quotation and Proforma Invoice PDFs. No batch columns
 * (batches are assigned after the PI is confirmed). Sections the user switched off — freight & C&F,
 * bank details, notes & other details — are omitted, and freight is left out of the totals.
 */
export function PriceDocument({
  kind,
  company,
  data,
}: {
  kind: keyof typeof KINDS;
  company: CompanyProfile;
  data: ProformaData;
}) {
  const k = KINDS[kind];
  const goods = data.items.reduce((s, i) => s + i.totalUsd, 0);
  const charges = data.airFreight + data.handlingDocumentation;
  const c = data.customer;
  const terms = data.showOtherDetails && (data.paymentTerms || data.marks);
  const showTermsBox = data.showFreight || terms;
  const notes = data.showOtherDetails && data.notes;

  return (
    <PdfDocument title={`${k.docTitle} ${data.orderNumber}`} watermark={data.status === "cancelled" ? "CANCELLED" : null}>
      <CompanyHeader
        company={company}
        title={k.heading}
        rows={[
          ["No:", data.orderNumber],
          ["Date:", docDate(data.createdAt)],
          ["Currency:", "USD"],
          ...(data.showFreight ? ([["Shipment:", SHIPPING_MODE.toUpperCase()]] as [string, string][]) : []),
        ]}
      />

      <div className="grid2">
        <Box title="Billing & shipping to">
          <Lines
            values={[
              c.businessName || c.name,
              c.businessName ? c.name : null,
              c.contactPerson ? `Attn: ${c.contactPerson}` : null,
              [c.address, c.city].filter(Boolean).join(", "),
              c.country,
              [c.phone, c.email].filter(Boolean).join("  ·  "),
            ]}
          />
        </Box>
        {showTermsBox && (
          <Box title="Terms">
            {data.showOtherDetails && data.paymentTerms && <p>Payment: {data.paymentTerms}</p>}
            {data.showFreight && <p>Delivery: C&amp;F {data.cnfDestination || "—"} {SHIPPING_MODE}</p>}
            {data.showOtherDetails && data.marks && <p>Marks: {data.marks}</p>}
          </Box>
        )}
      </div>

      <table className="items">
        <thead>
          <tr>
            <th className="center">#</th>
            <th>Brand name{data.showGenericName ? " / Generic name" : ""}</th>
            <th>Unit</th>
            <th>Country</th>
            <th>MNF</th>
            {data.showMfd && <th>MFD</th>}
            {data.showExp && <th>EXP</th>}
            <th className="num">Qty</th>
            <th className="num">Rate US$</th>
            <th className="num">Total US$</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td className="center">{i + 1}</td>
              <td>
                <strong>{item.brandName}</strong>
                {data.showGenericName && item.genericName && <div className="generic">{item.genericName}</div>}
              </td>
              <td className="nowrap">{item.unit ?? ""}</td>
              <td>{item.country ?? ""}</td>
              <td>{item.manufacturerName ?? ""}</td>
              {data.showMfd && <td className="nowrap">{monYY(item.mfd)}</td>}
              {data.showExp && <td className="nowrap">{monYY(item.exp)}</td>}
              <td className="num">
                {item.quantity.toLocaleString("en-US")} {QTY_LABEL}
              </td>
              <td className="num">{money(item.sellingPriceUsd)}</td>
              <td className="num">{money(item.totalUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="totals">
        <tbody>
          {data.showFreight && (
            <>
              <tr>
                <td>{TOTAL_LABELS.subTotal} (US$)</td>
                <td className="num">{money(goods)}</td>
              </tr>
              <tr>
                <td>{TOTAL_LABELS.charges} (US$)</td>
                <td className="num">{money(charges)}</td>
              </tr>
            </>
          )}
          <tr className="grand">
            <td>{data.showFreight ? `${cnfTotalLabel(data.cnfDestination)} (US$)` : "Total (US$)"}</td>
            <td className="num">{money(data.totalCnf)}</td>
          </tr>
        </tbody>
      </table>
      <p className="words">{data.amountInWords}</p>

      {(notes || data.showBankDetails) && (
        <div className="grid2">
          {notes && (
            <Box title="Notes">
              <p className="pre">{data.notes}</p>
            </Box>
          )}
          {data.showBankDetails && <BankDetails bank={data.bank} />}
        </div>
      )}

      {k.signature && (
        <div className="footer-row">
          <div className="muted">Date: {docDate(data.createdAt)}</div>
          <div className="signature">
            <div className="sig-line">Authorised signature — For {company.name}</div>
          </div>
        </div>
      )}

      <p className="thanks">{k.closing}</p>
    </PdfDocument>
  );
}

/** A4 landscape Proforma Invoice (PI-…): sections switched off on the PI are left out. */
export function ProformaInvoice({ company, data }: { company: CompanyProfile; data: ProformaData }) {
  return <PriceDocument kind="proforma" company={company} data={data} />;
}
