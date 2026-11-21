import { PdfDocument } from "@/components/pdf/PdfLayout";

export interface ReportPdfData {
  title: string;
  subtitle: string;
  generatedAt: string;
  summary: { label: string; value: string }[];
  columns: { header: string; numeric?: boolean }[];
  rows: string[][];
}

/** Generic tabular report export (CLAUDE.md §11: Excel/PDF export). */
export function ReportPdf({ data }: { data: ReportPdfData }) {
  return (
    <PdfDocument title={data.title}>
      <div className="header">
        <div>
          <p className="company-name">{data.title}</p>
          <div className="muted">{data.subtitle}</div>
        </div>
        <div className="title-block muted">Generated {data.generatedAt}</div>
      </div>
      {data.summary.length > 0 && (
        <div className="grid2">
          {data.summary.map((s) => (
            <div key={s.label} className="box">
              <div className="box-title">{s.label}</div>
              <p>
                <strong>{s.value}</strong>
              </p>
            </div>
          ))}
        </div>
      )}
      <table className="items">
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th key={c.header} className={c.numeric ? "num" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={data.columns[j]?.numeric ? "num" : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </PdfDocument>
  );
}
