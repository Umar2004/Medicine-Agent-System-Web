"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { EChart, formatValue, type ValueKind } from "@/components/charts/EChart";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPES = [
  { id: "inventory", label: "Inventory", dated: false },
  { id: "expiry", label: "Expiry", dated: false },
  { id: "orders", label: "Orders & sales", dated: true },
  { id: "customers", label: "Customers", dated: true },
  { id: "manufacturers", label: "Manufacturers", dated: true },
  { id: "invoice-value", label: "Invoice value", dated: true },
] as const;
type ReportType = (typeof TYPES)[number]["id"];

interface ReportResult {
  type: ReportType;
  title: string;
  subtitle: string;
  generatedAt: string;
  cached: boolean;
  summary: { label: string; value: number | string; kind: ValueKind }[];
  chart: { kind: "bar" | "line"; title: string; categories: string[]; series: { name: string; kind: ValueKind; data: number[]; reference?: boolean }[] } | null;
  columns: { key: string; header: string; kind: ValueKind }[];
  rows: Record<string, string | number | null>[];
}

const MAX_ROWS = 500;
const isoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(d);

function display(value: string | number | null | undefined, kind: ValueKind): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "date") return formatDate(String(value));
  if (kind === "text") return String(value);
  return formatValue(Number(value), kind);
}

export function ReportsView() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { data: session } = useSession();
  const { companyId } = useCompany();
  const isAdmin = session?.user.role === "admin";

  const [type, setType] = useState<ReportType>("orders");
  const [dateTo, setDateTo] = useState(() => isoDay(new Date()));
  const [dateFrom, setDateFrom] = useState(() => isoDay(new Date(Date.now() - 89 * 86_400_000)));
  const [months, setMonths] = useState("6");
  const [allMine, setAllMine] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const meta = TYPES.find((t) => t.id === type)!;
  const params = {
    ...(meta.dated ? { dateFrom, dateTo } : {}),
    ...(type === "expiry" ? { months } : {}),
    ...(isAdmin && allMine ? { scope: "all" } : {}),
  };

  const query = useQuery({
    queryKey: ["reports", type, companyId, params],
    queryFn: () => api.get<ReportResult>(`/api/reports/${type}`, params),
    enabled: can("view_reports"),
    placeholderData: keepPreviousData,
  });

  async function exportAs(format: "xlsx" | "pdf") {
    setExporting(format);
    try {
      await api.download(`/api/reports/${type}`, { ...params, format });
    } catch (err) {
      showError(errorMessage(err), "Export failed");
    } finally {
      setExporting(null);
    }
  }

  if (!can("view_reports")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-text-secondary">
          You need the “View reports” permission to see reports.
        </div>
      </div>
    );
  }

  const r = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Filter, chart and export. Results are cached for 5 minutes — use refresh for live numbers."
        action={
          <>
            <Button variant="outline" disabled={!r || !!exporting} onClick={() => void exportAs("xlsx")}>
              {exporting === "xlsx" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              Excel
            </Button>
            <Button variant="outline" disabled={!r || !!exporting} onClick={() => void exportAs("pdf")}>
              {exporting === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />}
              PDF
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-1 border-b">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setType(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              type === t.id ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters — one row above the content */}
      <div className="flex flex-wrap items-end gap-4">
        {meta.dated && (
          <>
            <div className="space-y-1">
              <Label htmlFor="r-from" className="text-xs text-text-secondary">
                From
              </Label>
              <Input id="r-from" type="date" className="h-9 w-40" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-to" className="text-xs text-text-secondary">
                To
              </Label>
              <Input id="r-to" type="date" className="h-9 w-40" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </>
        )}
        {type === "expiry" && (
          <div className="space-y-1">
            <Label className="text-xs text-text-secondary">Expiring within</Label>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="h-9 w-36" aria-label="Expiring within">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1", "3", "6", "9", "12", "18", "24"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m} month{m === "1" ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {isAdmin && meta.dated && (
          <div className="flex h-9 items-center gap-2">
            <Switch id="r-all" checked={allMine} onCheckedChange={setAllMine} />
            <Label htmlFor="r-all" className="text-sm">
              All my companies
            </Label>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          disabled={query.isFetching}
          onClick={async () => {
            const data = await api.get<ReportResult>(`/api/reports/${type}`, { ...params, refresh: 1 });
            queryClient.setQueryData(["reports", type, companyId, params], data);
          }}
        >
          <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          Refresh
        </Button>
        {r && (
          <span className="ml-auto text-xs text-text-muted">
            {r.subtitle} · {r.cached ? "cached" : "generated"} {new Date(r.generatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {query.isError ? (
        <ErrorState error={query.error} />
      ) : !r ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className={cn("space-y-6 transition-opacity", query.isFetching && "opacity-60")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {r.summary.map((s) => (
              <Card key={s.label} className="gap-1 py-4">
                <CardContent className="px-4">
                  <div className="text-xs font-medium text-text-secondary">{s.label}</div>
                  <div className="mt-1 font-mono text-2xl font-semibold tracking-tight">{display(s.value, s.kind)}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {r.chart && r.chart.categories.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{r.chart.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <EChart kind={r.chart.kind} categories={r.chart.categories} series={r.chart.series} ariaLabel={r.chart.title} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{r.title}</CardTitle>
              <span className="text-xs text-text-muted">
                {r.rows.length.toLocaleString()} row{r.rows.length === 1 ? "" : "s"}
                {r.rows.length > MAX_ROWS && ` · showing first ${MAX_ROWS} — export for all`}
              </span>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-xs text-text-secondary">
                  <tr className="border-b">
                    {r.columns.map((c) => (
                      <th key={c.key} className={cn("py-2 pr-3 font-medium", c.kind === "text" || c.kind === "date" ? "text-left" : "text-right")}>
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.slice(0, MAX_ROWS).map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                      {r.columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "py-1.5 pr-3",
                            c.kind === "text" || c.kind === "date" ? "text-left" : "text-right font-mono",
                          )}
                        >
                          {display(row[c.key], c.kind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {r.rows.length === 0 && (
                    <tr>
                      <td colSpan={r.columns.length} className="py-10 text-center text-text-secondary">
                        No data for these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
