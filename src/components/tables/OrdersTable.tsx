"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleAlert, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { SelectCompanyNotice } from "@/components/shared/SelectCompanyNotice";
import { DocumentTypeBadge, ORDER_STATUS_LABELS, OrderStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { api } from "@/lib/api-client";
import { formatDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderDocumentType, OrderListItem, OrderStatus } from "@/types/entities";

const TABS: { label: string; statuses: OrderStatus[] }[] = [
  { label: "All", statuses: [] },
  { label: "Draft", statuses: ["draft"] },
  { label: "Sent / negotiating", statuses: ["sent", "negotiating"] },
  { label: "Confirmed", statuses: ["confirmed"] },
  { label: ORDER_STATUS_LABELS.batch_assigned, statuses: ["batch_assigned"] },
  { label: "Invoiced", statuses: ["invoiced"] },
  { label: "Completed", statuses: ["completed"] },
  { label: "Cancelled", statuses: ["cancelled"] },
];

const DOC_TYPES: { value: "all" | OrderDocumentType; label: string }[] = [
  { value: "all", label: "All documents" },
  { value: "proforma_invoice", label: "Proforma invoices" },
  { value: "commercial_invoice", label: "Invoices" },
];

/** PIs and invoices — quotations live under /quotations. */
export function OrdersTable() {
  const router = useRouter();
  const { can } = usePermissions();
  const { companyId, isAllCompanies } = useCompany();
  const canCreate = can("manage_proforma_invoices") && !isAllCompanies;
  const { params, search, setSearch, resetPage, tableProps } = useServerTable({ id: "createdAt", desc: true });
  const [tab, setTab] = useState(0);
  const [docType, setDocType] = useState<"all" | OrderDocumentType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters = {
    ...params,
    status: TABS[tab].statuses.join(","),
    documentType: docType === "all" ? "" : docType,
    dateFrom,
    dateTo,
  };
  const query = useQuery({
    queryKey: ["orders", companyId, filters],
    queryFn: () => api.list<OrderListItem>("/api/orders", filters),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<OrderListItem, unknown>[]>(() => {
    const cols: ColumnDef<OrderListItem, unknown>[] = [
      {
        id: "orderNumber",
        header: "Number",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-medium">{row.original.orderNumber}</span>
            {row.original.convertedFromQuotationId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <FileText className="size-3.5 text-text-muted" aria-label="Created from a quotation" />
                </TooltipTrigger>
                <TooltipContent>Created from a quotation</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        id: "documentType",
        header: "Type",
        cell: ({ row }) => <DocumentTypeBadge type={row.original.documentType} />,
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
        id: "items",
        header: "Lines",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono">{row.original.itemCount}</span>,
      },
      {
        id: "totalCnf",
        header: "C&F total",
        cell: ({ row }) => <span className="font-mono">{formatUsd(row.original.totalCnf)}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <OrderStatusBadge status={row.original.status} />
            {row.original.status === "negotiating" && row.original.rejectionReason && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleAlert className="size-4 text-warning-text" aria-label="Changes requested" />
                </TooltipTrigger>
                <TooltipContent className="max-w-64">Changes requested: {row.original.rejectionReason}</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
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
      cols.splice(2, 0, {
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
        title="Orders"
        description="Proforma invoices and the invoices they become. Batches are assigned on confirmed PIs."
        action={
          canCreate && (
            <Button asChild>
              <Link href="/orders/new">
                <Plus />
                New proforma invoice
              </Link>
            </Button>
          )
        }
      />
      {isAllCompanies && can("manage_proforma_invoices") && <SelectCompanyNotice what="orders" />}

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
        <Select
          value={docType}
          onValueChange={(v) => {
            setDocType(v as "all" | OrderDocumentType);
            resetPage();
          }}
        >
          <SelectTrigger className="h-9 w-48" aria-label="Document type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
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
          emptyMessage={search ? `No orders match “${search}”.` : "No orders here yet."}
          onRowClick={(o) => router.push(`/orders/${o.id}`)}
          getRowId={(o) => o.id}
          {...tableProps}
        />
      )}
    </div>
  );
}
