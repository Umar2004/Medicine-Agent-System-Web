"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { InvoiceStatusBadge } from "@/components/shared/StatusBadge";
import { useCompany } from "@/hooks/use-company";
import { useServerTable } from "@/hooks/use-server-table";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { PackingListSummary } from "@/types/entities";

export function PackingListsTable() {
  const router = useRouter();
  const { companyId, isAllCompanies } = useCompany();
  const { params, search, setSearch, tableProps } = useServerTable({ id: "createdAt", desc: true });

  const query = useQuery({
    queryKey: ["packing-lists", companyId, params],
    queryFn: () => api.list<PackingListSummary>("/api/packing-lists", params),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<PackingListSummary, unknown>[]>(() => {
    const cols: ColumnDef<PackingListSummary, unknown>[] = [
      {
        id: "invoiceNumber",
        header: "Invoice",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium">{row.original.invoiceNumber}</span>
            <InvoiceStatusBadge status={row.original.invoiceStatus} />
          </div>
        ),
      },
      { id: "customer", header: "Customer", enableSorting: false, cell: ({ row }) => row.original.customerName ?? "—" },
      { id: "shipment", header: "Shipment", enableSorting: false, cell: ({ row }) => row.original.shipmentReference ?? "—" },
      { id: "cartons", header: "Cartons", enableSorting: false, cell: ({ row }) => row.original.totalCartons ?? "—" },
      {
        id: "lines",
        header: "Lines",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono">{row.original.lineCount}</span>,
      },
      { id: "date", header: "Date", enableSorting: false, cell: ({ row }) => formatDate(row.original.date) },
    ];
    if (isAllCompanies) {
      cols.splice(1, 0, {
        id: "company",
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
        title="Packing lists"
        description="Carton details per invoice. Create one from an invoice's page (“Packing list” button)."
      />
      <SearchInput onSearch={setSearch} placeholder="Search invoice, shipment or customer…" />
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search ? `No packing lists match “${search}”.` : "No packing lists yet."}
          onRowClick={(p) => router.push(`/invoices/${p.invoiceId}/packing`)}
          getRowId={(p) => p.id}
          {...tableProps}
        />
      )}
    </div>
  );
}
