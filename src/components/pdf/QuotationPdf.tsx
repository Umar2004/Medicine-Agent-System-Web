import { PriceDocument, type ProformaData } from "@/components/pdf/ProformaInvoice";
import type { CompanyProfile } from "@/lib/company-profile";

/** Same shape as a PI — `orderNumber` carries the quotation number (QT-SFL-0001). */
export type QuotationPdfData = ProformaData;

/**
 * A4 landscape Quotation (QT-…). No batches and no signature block; freight, bank details and
 * notes appear only when switched on for the quotation (all off by default).
 */
export function QuotationPdf({ company, data }: { company: CompanyProfile; data: QuotationPdfData }) {
  return <PriceDocument kind="quotation" company={company} data={data} />;
}
