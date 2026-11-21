import { Box, CompanyHeader, docDate, Lines, PdfDocument } from "@/components/pdf/PdfLayout";
import type { CompanyProfile } from "@/lib/company-profile";

export interface PackingListData {
  invoiceNumber: string;
  shipmentReference: string | null;
  date: string | null;
  consignee: (string | null)[];
  totalCartons: string | null;
  containerInfo: string | null;
  grossWeightKg: number | null;
  netWeightKg: number | null;
  cbm: number | null;
  marks: string | null;
  items: { cartonStart: number | null; cartonEnd: number | null; description: string | null; packingDetails: string | null }[];
}

const kg = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} KG`);

/** A4 portrait packing list (audit/06 §7 sample: carton ranges + packing formula + summary). */
export function PackingList({ company, data }: { company: CompanyProfile; data: PackingListData }) {
  return (
    <PdfDocument title={`Packing list ${data.invoiceNumber}`}>
      <CompanyHeader
        company={company}
        title="PACKING LIST"
        rows={[
          ["Invoice No:", data.invoiceNumber],
          ["Date:", data.date ? docDate(data.date) : "—"],
          ...(data.shipmentReference ? ([["Shipment:", data.shipmentReference]] as [string, string][]) : []),
        ]}
      />

      {data.consignee.some(Boolean) && (
        <div className="grid2">
          <Box title="Consignee">
            <Lines values={data.consignee} />
          </Box>
        </div>
      )}

      <table className="items">
        <thead>
          <tr>
            <th className="center">Carton No</th>
            <th>Description of item</th>
            <th>Packing details</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td className="center nowrap">
                {item.cartonStart !== null && item.cartonEnd !== null
                  ? `${item.cartonStart} - ${item.cartonEnd}`
                  : (item.cartonStart ?? item.cartonEnd ?? "")}
              </td>
              <td>{item.description ?? ""}</td>
              <td className="nowrap">{item.packingDetails ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="box">
        <table className="summary">
          <tbody>
            <tr>
              <td>Total number of cartons</td>
              <td>
                <strong>{[data.totalCartons, data.containerInfo].filter(Boolean).join(" - ") || "—"}</strong>
              </td>
            </tr>
            <tr>
              <td>Gross weight</td>
              <td>
                <strong>{kg(data.grossWeightKg)}</strong>
              </td>
            </tr>
            <tr>
              <td>Net weight</td>
              <td>
                <strong>{kg(data.netWeightKg)}</strong>
              </td>
            </tr>
            <tr>
              <td>CBM</td>
              <td>
                <strong>{data.cbm === null ? "—" : `${data.cbm.toLocaleString("en-US", { maximumFractionDigits: 2 })} CBM`}</strong>
              </td>
            </tr>
            <tr>
              <td>Marks</td>
              <td>
                <strong>{data.marks || "—"}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="footer-row">
        <div className="muted">Date: {data.date ? docDate(data.date) : "—"}</div>
        <div className="signature">
          <div className="sig-line">For {company.name}</div>
        </div>
      </div>
    </PdfDocument>
  );
}
