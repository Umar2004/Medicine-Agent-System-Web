/* eslint-disable @next/next/no-head-element, @next/next/no-img-element -- print template rendered to static HTML for headless Chrome, not a Next.js page */
import type { ReactNode } from "react";
import type { CompanyProfile } from "@/lib/company-profile";

// Print templates are rendered to static HTML for headless Chrome (src/lib/pdf.ts).
// They carry their own stylesheet — Tailwind is not available inside the PDF renderer.

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #0F172A; line-height: 1.35; }
.doc { position: relative; padding: 0 2px; } /* keeps right-hand borders inside the printable area */
.watermark { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 96px; font-weight: 700;
  color: rgba(239, 68, 68, 0.12); transform: rotate(-18deg); z-index: 0; letter-spacing: 8px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
  border-bottom: 2px solid #0F766E; padding-bottom: 8px; margin-bottom: 10px; }
.brand { display: flex; gap: 10px; align-items: flex-start; }
.logo { max-height: 56px; max-width: 120px; object-fit: contain; }
.company-name { font-size: 16px; font-weight: 700; color: #0F766E; margin: 0 0 2px; }
.muted { color: #64748B; }
.title-block { text-align: right; }
.doc-title { font-size: 18px; font-weight: 700; letter-spacing: 1px; margin: 0 0 4px; }
.kv { border-collapse: collapse; margin-left: auto; }
.kv td { padding: 1px 0 1px 10px; text-align: right; }
.kv td:first-child { color: #64748B; }
.grid2 { display: flex; gap: 10px; margin-bottom: 10px; }
.grid2 > * { flex: 1; }
.stack > * + * { margin-top: 6px; }
.box { border: 1px solid #CBD5E1; border-radius: 3px; padding: 6px 8px; }
.box-title { font-size: 8px; font-weight: 700; color: #0F766E; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px; }
.box p { margin: 0; }
table.items { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
table.items th { background: #0F766E; color: #fff; font-size: 8px; text-transform: uppercase; padding: 5px 4px; text-align: left;
  border: 1px solid #0F766E; }
table.items td { border: 1px solid #CBD5E1; padding: 4px; vertical-align: top; }
table.items tr { page-break-inside: avoid; }
table.items thead { display: table-header-group; }
.num { text-align: right !important; white-space: nowrap; font-variant-numeric: tabular-nums; }
.center { text-align: center !important; }
.nowrap { white-space: nowrap; }
.generic { color: #64748B; font-size: 8.5px; }
.totals { width: 46%; margin-left: auto; border-collapse: collapse; page-break-inside: avoid; }
.totals td { padding: 3px 6px; border: 1px solid #CBD5E1; }
.totals .grand td { background: #CCFBF1; font-weight: 700; font-size: 10.5px; }
.words { margin: 6px 0 10px; font-weight: 700; text-transform: uppercase; }
.footer-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px; page-break-inside: avoid; }
.signature { text-align: center; min-width: 180px; }
.signature img { max-height: 60px; max-width: 180px; object-fit: contain; display: block; margin: 0 auto 2px; }
.sig-line { border-top: 1px solid #0F172A; padding-top: 3px; font-size: 8.5px; }
.pre { white-space: pre-wrap; }
.thanks { text-align: center; margin-top: 14px; color: #64748B; }
.summary td { padding: 3px 8px 3px 0; }
.summary td:first-child { color: #64748B; white-space: nowrap; }
`;

export function PdfDocument({ title, watermark, children }: { title: string; watermark?: string | null; children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <div className="doc">
          {watermark && <div className="watermark">{watermark}</div>}
          {children}
        </div>
      </body>
    </html>
  );
}

export function CompanyHeader({
  company,
  title,
  rows,
}: {
  company: CompanyProfile;
  title: string;
  rows: [string, ReactNode][];
}) {
  return (
    <div className="header">
      <div className="brand">
        {company.logoDataUri && <img className="logo" src={company.logoDataUri} alt="" />}
        <div>
          <p className="company-name">{company.name}</p>
          {company.address && <div className="pre">{company.address}</div>}
          <div className="muted">
            {[company.phone && `Tel: ${company.phone}`, company.email, company.website].filter(Boolean).join("  ·  ")}
          </div>
          {company.taxId && <div className="muted">TIN: {company.taxId}</div>}
        </div>
      </div>
      <div className="title-block">
        <p className="doc-title">{title}</p>
        <table className="kv">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>
                  <strong>{v}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="box">
      <div className="box-title">{title}</div>
      {children}
    </div>
  );
}

export function Lines({ values }: { values: (string | null | undefined)[] }) {
  const shown = values.filter((v): v is string => !!v && v.trim() !== "");
  if (shown.length === 0) return <p className="muted">—</p>;
  return (
    <>
      {shown.map((v, i) => (
        <p key={i} className={i === 0 ? "pre" : "pre muted"}>
          {i === 0 ? <strong>{v}</strong> : v}
        </p>
      ))}
    </>
  );
}

export interface BankBlock {
  bankName: string;
  accountNumber: string;
  swiftCode: string | null;
  branchName: string | null;
  otherDetails: string | null;
}

export function BankDetails({ bank }: { bank: BankBlock | null }) {
  return (
    <Box title="Bank / remittance details">
      {bank ? (
        <>
          <p>
            <strong>{bank.bankName}</strong>
          </p>
          <p>A/C: {bank.accountNumber}</p>
          {bank.branchName && <p>Branch: {bank.branchName}</p>}
          {bank.swiftCode && <p>SWIFT: {bank.swiftCode}</p>}
          {bank.otherDetails && <p className="pre muted">{bank.otherDetails}</p>}
        </>
      ) : (
        <p className="muted">—</p>
      )}
    </Box>
  );
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const docDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Colombo" });
