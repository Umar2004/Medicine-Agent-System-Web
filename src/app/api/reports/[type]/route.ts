import { createElement } from "react";
import { ReportPdf } from "@/components/pdf/ReportPdf";
import { errors, handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { pdfResponse, renderPdf } from "@/lib/pdf";
import { requirePermission } from "@/lib/permissions";
import { reportToPdfData, reportToXlsx } from "@/lib/report-export";
import { parseReportParams, REPORT_TYPES, resolveReportScope, runReport, type ReportType } from "@/lib/reports";
import { getRequestMeta } from "@/lib/request-meta";

/**
 * GET /api/reports/{inventory|expiry|orders|customers|manufacturers|invoice-value}
 *   ?dateFrom=&dateTo=&months=&scope=all&refresh=1&format=json|xlsx|pdf
 */
export const GET = handler<{ type: string }>(async (req, { params }) => {
  const { type } = await params;
  if (!(REPORT_TYPES as readonly string[]).includes(type)) throw errors.notFound("Report");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const scope = await resolveReportScope(req, user);
  const auditCompany = scope.companyIds?.length === 1 ? scope.companyIds[0] : null;
  await requirePermission(user, "view_reports", { meta, companyId: auditCompany });

  const search = req.nextUrl.searchParams;
  const reportParams = parseReportParams(search);
  const format = search.get("format") ?? "json";
  const { result, cached } = await runReport(type as ReportType, reportParams, scope, search.get("refresh") === "1");

  if (format === "json") {
    if (!cached) {
      auditLog({
        user,
        companyId: auditCompany,
        actionType: ACTION_TYPES.REPORT_GENERATED,
        entityName: "Report",
        entityId: type,
        newValue: { ...reportParams, scope: scope.label, rows: result.rows.length },
        meta,
      });
    }
    return ok({ ...result, cached });
  }

  auditLog({
    user,
    companyId: auditCompany,
    actionType: ACTION_TYPES.REPORT_EXPORTED,
    entityName: "Report",
    entityId: type,
    newValue: { format, ...reportParams, scope: scope.label },
    meta,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const bytes = await reportToXlsx(result);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${type}-report-${stamp}.xlsx"`,
        "cache-control": "private, no-store",
      },
    });
  }
  if (format === "pdf") {
    const pdf = await renderPdf(createElement(ReportPdf, { data: reportToPdfData(result) }), {
      landscape: result.columns.length > 6,
      footerLabel: `${result.title} · ${result.subtitle}`,
    });
    return pdfResponse(pdf, `${type}-report-${stamp}.pdf`, true);
  }
  throw errors.badRequest("format must be json, xlsx or pdf");
});
