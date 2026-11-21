import "server-only";
import type { ReportPdfData } from "@/components/pdf/ReportPdf";
import type { ReportResult, ValueKind } from "@/lib/reports";

const NUM_FMT: Partial<Record<ValueKind, string>> = {
  number: "#,##0",
  usd: '"$"#,##0.00',
  lkr: '#,##0.00 "LKR"',
  date: "dd mmm yyyy",
};

function cellValue(value: string | number | null, kind: ValueKind): string | number | Date | null {
  if (value === null || value === undefined) return null;
  if (kind === "date") return new Date(String(value));
  return value;
}

/** ExcelJS workbook: title, summary block, styled header row with filters, typed number formats. */
export async function reportToXlsx(report: ReportResult): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Medicine Agent";
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 0 }] });

  ws.addRow([report.title]).font = { bold: true, size: 14, color: { argb: "FF0F766E" } };
  ws.addRow([report.subtitle]).font = { color: { argb: "FF64748B" } };
  ws.addRow([`Generated ${new Date(report.generatedAt).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}`]).font = {
    color: { argb: "FF94A3B8" },
    size: 9,
  };
  ws.addRow([]);
  for (const s of report.summary) {
    const row = ws.addRow([s.label, s.value]);
    row.getCell(1).font = { color: { argb: "FF64748B" } };
    row.getCell(2).font = { bold: true };
    const fmt = NUM_FMT[s.kind];
    if (fmt && typeof s.value === "number") row.getCell(2).numFmt = fmt;
  }
  ws.addRow([]);

  const header = ws.addRow(report.columns.map((c) => c.header));
  const headerRowNumber = header.number;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { vertical: "middle" };
  });
  ws.views = [{ state: "frozen", ySplit: headerRowNumber }];

  for (const r of report.rows) {
    const row = ws.addRow(report.columns.map((c) => cellValue(r[c.key] ?? null, c.kind)));
    report.columns.forEach((c, i) => {
      const fmt = NUM_FMT[c.kind];
      if (fmt) row.getCell(i + 1).numFmt = fmt;
    });
  }
  ws.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: report.columns.length },
  };
  report.columns.forEach((c, i) => {
    const longest = Math.max(c.header.length, ...report.rows.slice(0, 500).map((r) => String(r[c.key] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(48, Math.max(10, longest + 2));
  });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function display(value: string | number | null | undefined, kind: ValueKind): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (kind) {
    case "number":
      return Number(value).toLocaleString("en-US");
    case "usd":
      return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "lkr":
      return `${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LKR`;
    case "date":
      return new Date(String(value)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Colombo" });
    default:
      return String(value);
  }
}

export function reportToPdfData(report: ReportResult): ReportPdfData {
  return {
    title: report.title,
    subtitle: report.subtitle,
    generatedAt: display(report.generatedAt, "date"),
    summary: report.summary.map((s) => ({ label: s.label, value: display(s.value, s.kind) })),
    columns: report.columns.map((c) => ({ header: c.header, numeric: c.kind === "number" || c.kind === "usd" || c.kind === "lkr" })),
    rows: report.rows.map((r) => report.columns.map((c) => display(r[c.key], c.kind))),
  };
}
