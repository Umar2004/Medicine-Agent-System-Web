"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { INVOICE_STATUS_LABELS, InvoiceStatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/hooks/use-company";
import { useServerTable } from "@/hooks/use-server-table";
import { api } from "@/lib/api-client";
import { formatDate, formatUsd } from "@/lib/format";
import type { InvoiceListItem, InvoiceStatus } from "@/types/entities";

const ALL = "__all__";

export function InvoicesTable() {
  const router = useRouter();
  const { companyId, isAllCompanies } = useCompany();
  const { params, search, setSearch, resetPage, tableProps } = useServerTable({ id: "createdAt", desc: true });
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters = { ...params, status, dateFrom, dateTo };
  const query = useQuery({
    queryKey: ["invoices", companyId, filters],
    queryFn: () => api.list<InvoiceListItem>("/api/invoices", filters),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<InvoiceListItem, unknown>[]>(() => {
    const cols: ColumnDef<InvoiceListItem, unknown>[] = [
      {
        id: "invoiceNumber",
        header: "Invoice",
        cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.invoiceNumber}</span>,
      },
      {
        id: "customerName",
        header: "Customer",
        cell: ({ row }) => (
          <div className="font-medium">{row.original.customerName ?? row.original.consigneeName ?? "—"}</div>
        ),
      },
      {
        id: "orderNumber",
        header: "Proforma invoice",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.orderId && row.original.orderNumber ? (
            <Link
              href={`/orders/${row.original.orderId}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-xs text-primary hover:underline"
            >
              {row.original.orderNumber}
            </Link>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      {
        id: "totalAmountUsd",
        header: "Amount",
        cell: ({ row }) => <span className="font-mono">{formatUsd(row.original.totalAmountUsd)}</span>,
      },
      { id: "status", header: "Status", cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} /> },
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
        title="Invoices"
        description="Created from a proforma invoice once its batches are assigned. Cancelling one returns the PI to Batches assigned."
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput onSearch={setSearch} placeholder="Search invoice, PI or customer…" />
        <Select
          value={status || ALL}
          onValueChange={(v) => {
            setStatus(v === ALL ? "" : (v as InvoiceStatus));
            resetPage();
          }}
        >
          <SelectTrigger className="w-40" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {INVOICE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          emptyMessage={search ? `No invoices match “${search}”.` : "No invoices yet."}
          onRowClick={(inv) => router.push(`/invoices/${inv.id}`)}
          getRowId={(inv) => inv.id}
          {...tableProps}
        />
      )}
    </div>
  );
}
