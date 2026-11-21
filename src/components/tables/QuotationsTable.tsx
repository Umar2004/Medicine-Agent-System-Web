"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, CircleAlert, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { SelectCompanyNotice } from "@/components/shared/SelectCompanyNotice";
import { QuotationStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { api } from "@/lib/api-client";
import { formatDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuotationListItem, QuotationStatus } from "@/types/entities";

const TABS: { label: string; statuses: QuotationStatus[] }[] = [
  { label: "All", statuses: [] },
  { label: "Draft", statuses: ["draft"] },
  { label: "Sent", statuses: ["sent"] },
  { label: "Negotiating", statuses: ["negotiating"] },
  { label: "Accepted", statuses: ["accepted"] },
  { label: "Rejected", statuses: ["rejected"] },
  { label: "Converted", statuses: ["converted"] },
];

export function QuotationsTable() {
  const router = useRouter();
  const { can } = usePermissions();
  const { companyId, isAllCompanies } = useCompany();
  const canCreate = can("manage_quotations") && !isAllCompanies;
  const { params, search, setSearch, resetPage, tableProps } = useServerTable({ id: "createdAt", desc: true });
  const [tab, setTab] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters = { ...params, status: TABS[tab].statuses.join(","), dateFrom, dateTo };
  const query = useQuery({
    queryKey: ["quotations", companyId, filters],
    queryFn: () => api.list<QuotationListItem>("/api/quotations", filters),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<QuotationListItem, unknown>[]>(() => {
    const cols: ColumnDef<QuotationListItem, unknown>[] = [
      {
        id: "quotationNumber",
        header: "Number",
        cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.quotationNumber}</span>,
      },
      {
        id: "customerName",
        header: "Customer",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.customerName}</div>
            <div className="font-mono text-xs text-text-muted">{row.original.customerCode}</div>
          </div>
        ),
      },
      {
        id: "lines",
        header: "Lines",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono">{row.original.lineCount}</span>,
      },
      {
        id: "totalCnf",
        header: "Total",
        cell: ({ row }) => <span className="font-mono">{formatUsd(row.original.totalCnf)}</span>,
      },
      {
        id: "revision",
        header: "Rev",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs text-text-secondary">{row.original.revisionNumber}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const q = row.original;
          return (
            <div className="flex items-center gap-1.5">
              {q.status === "converted" && q.convertedToOrderId ? (
                <Link
                  href={`/orders/${q.convertedToOrderId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 hover:underline"
                  aria-label="Open the proforma invoice"
                >
                  <QuotationStatusBadge status={q.status} />
                  <ArrowRight className="size-3.5 text-primary" />
                </Link>
              ) : (
                <QuotationStatusBadge status={q.status} />
              )}
              {(q.status === "rejected" || q.status === "negotiating") && q.rejectionReason && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleAlert className="size-4 text-destructive" aria-label="Reason" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{q.rejectionReason}</TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      },
      {
        id: "sentAt",
        header: "Sent",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.sentAt ? (
            <span className="text-text-secondary">{formatDate(row.original.sentAt)}</span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      {
        id: "createdAt",
        header: "Date",
        cell: ({ row }) => <span className="text-text-secondary">{formatDate(row.original.createdAt)}</span>,
      },
    ];
    if (isAllCompanies) {
      cols.splice(1, 0, {
        id: "companyName",
        header: "Company",
        enableSorting: false,
        cell: ({ row }) => <span className="text-text-secondary">{row.original.companyName}</span>,
      });
    }
    return cols;
  }, [isAllCompanies]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        description="Price offers to customers. Accepted quotations convert into proforma invoices under Orders."
        action={
          canCreate && (
            <Button asChild>
              <Link href="/quotations/new">
                <Plus />
                New quotation
              </Link>
            </Button>
          )
        }
      />
      {isAllCompanies && can("manage_quotations") && <SelectCompanyNotice what="quotations" />}

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => {
              setTab(i);
              resetPage();
            }}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === i
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput onSearch={setSearch} placeholder="Search number or customer…" />
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span>From</span>
          <Input
            type="date"
            className="h-9 w-40"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              resetPage();
            }}
            aria-label="From date"
          />
          <span>to</span>
          <Input
            type="date"
            className="h-9 w-40"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              resetPage();
            }}
            aria-label="To date"
          />
        </div>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search ? `No quotations match “${search}”.` : "No quotations here yet."}
          onRowClick={(q) => router.push(`/quotations/${q.id}`)}
          getRowId={(q) => q.id}
          {...tableProps}
        />
      )}
    </div>
  );
}
