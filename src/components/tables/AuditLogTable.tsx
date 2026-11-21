"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { api } from "@/lib/api-client";
import { ACTION_TYPES } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditLogEntry } from "@/types/entities";

const muted = <span className="text-text-muted">—</span>;

/** "QuotationApproved" → "Quotation approved". */
function actionLabel(action: string): string {
  const words = action.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ACTIONS = [...new Set<string>(Object.values(ACTION_TYPES))].sort();

function actionTone(action: string): string {
  if (/Denied|Failed/.test(action)) return "text-destructive";
  if (/Deleted|Cancelled|Rejected|Deactivated/.test(action)) return "text-warning-text";
  return "text-foreground";
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Old and new values as a list of changed fields; anything else as plain text. */
function ValueChanges({ oldValue, newValue }: { oldValue: string | null; newValue: string | null }) {
  const before = parseJson(oldValue);
  const after = parseJson(newValue);
  if (before === null && after === null) return <p className="text-sm text-text-muted">No values recorded.</p>;

  if ((before === null || isRecord(before)) && (after === null || isRecord(after))) {
    const a = before ?? {};
    const b = after ?? {};
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => show(a[k]) !== show(b[k]));
    if (keys.length === 0) return <p className="text-sm text-text-muted">No fields changed.</p>;
    return (
      <table className="w-full table-fixed text-xs">
        <thead className="text-text-secondary">
          <tr className="border-b">
            <th className="w-1/4 py-1.5 pr-2 text-left font-medium">Field</th>
            {before !== null && <th className="py-1.5 pr-2 text-left font-medium">Before</th>}
            {after !== null && <th className="py-1.5 text-left font-medium">After</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-b align-top last:border-0">
              <td className="py-1.5 pr-2 font-medium break-words">{k}</td>
              {before !== null && <td className="py-1.5 pr-2 font-mono break-words text-text-secondary">{show(a[k])}</td>}
              {after !== null && <td className="py-1.5 font-mono break-words">{show(b[k])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <div className="space-y-2 font-mono text-xs break-words">
      {before !== null && <p className="text-text-secondary">Before: {show(before)}</p>}
      {after !== null && <p>After: {show(after)}</p>}
    </div>
  );
}

export function AuditLogTable() {
  const { can } = usePermissions();
  const { companyId, isAllCompanies } = useCompany();
  const allowed = can("view_audit_log");
  const { params, setSearch, resetPage, tableProps } = useServerTable({ id: "createdAt", desc: true });
  const [actionType, setActionType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const filters = { ...params, actionType: actionType === "all" ? "" : actionType, dateFrom, dateTo };
  const query = useQuery({
    queryKey: ["audit-log", companyId, filters],
    queryFn: () => api.list<AuditLogEntry>("/api/audit-log", filters),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });

  const columns = useMemo<ColumnDef<AuditLogEntry, unknown>[]>(() => {
    const cols: ColumnDef<AuditLogEntry, unknown>[] = [
      {
        id: "createdAt",
        header: "When",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>,
      },
      { id: "username", header: "User", enableSorting: false, cell: ({ row }) => row.original.username ?? muted },
      {
        id: "actionType",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => <span className={cn("font-medium", actionTone(row.original.actionType))}>{actionLabel(row.original.actionType)}</span>,
      },
      { id: "entityName", header: "Record", enableSorting: false, cell: ({ row }) => row.original.entityName ?? muted },
      {
        id: "page",
        header: "Page",
        enableSorting: false,
        cell: ({ row }) => (row.original.page ? <span className="text-xs text-text-secondary">{row.original.page}</span> : muted),
      },
    ];
    if (isAllCompanies) {
      cols.splice(2, 0, {
        id: "companyName",
        header: "Company",
        enableSorting: false,
        cell: ({ row }) => (row.original.companyName ? <span className="text-text-secondary">{row.original.companyName}</span> : muted),
      });
    }
    return cols;
  }, [isAllCompanies]);

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" />
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-text-secondary">
          You need the “View audit log” permission to see this page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description={isAllCompanies ? "Everything, across all companies. Click a row for details." : "This company's activity, plus logins and shared stock changes by its people. Click a row for details."}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput onSearch={setSearch} placeholder="Search user, record or ID…" />
        <Select
          value={actionType}
          onValueChange={(v) => {
            setActionType(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-52" aria-label="Filter by action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {actionLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-40"
          aria-label="From date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => {
            setDateFrom(e.target.value);
            resetPage();
          }}
        />
        <Input
          type="date"
          className="w-40"
          aria-label="To date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => {
            setDateTo(e.target.value);
            resetPage();
          }}
        />
      </div>
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage="No activity matches these filters."
          getRowId={(l) => l.id}
          onRowClick={setSelected}
          {...tableProps}
        />
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full gap-0 sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{actionLabel(selected.actionType)}</SheetTitle>
                <SheetDescription>
                  {selected.username ?? "Unknown user"} · {formatDateTime(selected.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  {(
                    [
                      ["Company", selected.companyName],
                      ["Record", selected.entityName],
                      ["Record ID", selected.entityId],
                      ["Page", selected.page],
                      ["IP address", selected.ipAddress],
                      ["Device", selected.userAgent],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-text-secondary">{label}</dt>
                      <dd className="min-w-0 break-words">{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Changes</h3>
                  <ValueChanges oldValue={selected.oldValue} newValue={selected.newValue} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
