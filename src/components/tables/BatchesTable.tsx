"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BatchFormSheet } from "@/components/forms/BatchFormSheet";
import { BATCH_STATUS_LABELS, BatchStatusBadge } from "@/components/shared/BatchStatusBadge";
import { DataTable } from "@/components/shared/DataTable";
import { EntityCombobox } from "@/components/shared/EntityCombobox";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { RowActions } from "@/components/shared/RowActions";
import { SearchInput } from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import type { Batch, BatchStatus, Product } from "@/types/entities";

const ALL = "__all__";
const muted = <span className="text-text-muted">—</span>;
const lkr = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BatchesTable({ productId }: { /** Embedded on a product page: fixed product, no page header. */ productId?: string }) {
  const embedded = !!productId;
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("manage_batches");
  const { params, search, setSearch, resetPage, tableProps } = useServerTable({ id: "exp" });
  const [productFilter, setProductFilter] = useState("");
  const [status, setStatus] = useState<BatchStatus | "">("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);

  const filters = { ...params, productId: productId ?? productFilter, status };
  const query = useQuery({
    queryKey: ["batches", filters],
    queryFn: () => api.list<Batch>("/api/batches", filters),
    placeholderData: keepPreviousData,
  });

  const products = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.list<Product>("/api/products", { pageSize: 200, sortBy: "brandName" }),
    enabled: !embedded,
    staleTime: 60_000,
  });
  const productOptions = useMemo(
    () => (products.data?.data ?? []).map((p) => ({ value: p.id, label: p.brandName, hint: p.productNumber })),
    [products.data],
  );

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (b: Batch) => api.del<{ id: string }>(`/api/batches/${b.id}`),
    onSuccess: (_d, b) => {
      toast.success(`Batch ${b.batchNumber} deleted`);
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete batch"),
  });

  const columns = useMemo<ColumnDef<Batch, unknown>[]>(() => {
    const cols: ColumnDef<Batch, unknown>[] = [
      {
        id: "batchNumber",
        header: "Batch",
        cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.batchNumber}</span>,
      },
    ];
    if (!embedded) {
      cols.push({
        id: "productName",
        header: "Product",
        cell: ({ row }) => (
          <Link
            href={`/products/${row.original.productId}`}
            className="font-medium hover:text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.productName}
          </Link>
        ),
      });
    }
    cols.push(
      {
        id: "mfd",
        header: "MFD",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.mfd ?? "—"}</span>,
      },
      { id: "exp", header: "EXP", cell: ({ row }) => <span className="font-mono text-xs">{row.original.exp ?? "—"}</span> },
      {
        id: "stockQuantity",
        header: "Stock",
        cell: ({ row }) => (
          <span className="font-mono">
            {row.original.stockQuantity.toLocaleString()}
            {row.original.productUnit && (
              <span className="ml-1 font-sans text-xs text-text-muted">{row.original.productUnit}</span>
            )}
          </span>
        ),
      },
      {
        id: "supplierName",
        header: "Supplier",
        cell: ({ row }) =>
          row.original.supplierName ? (
            <div>
              <div>{row.original.supplierName}</div>
              <div className="text-xs text-text-muted">{row.original.supplierCompanyName}</div>
            </div>
          ) : (
            muted
          ),
      },
      {
        id: "costPrice",
        header: "Cost (LKR)",
        cell: ({ row }) =>
          row.original.costPrice === null ? (
            muted
          ) : (
            <div>
              <span className="font-mono">{lkr.format(row.original.costPrice)}</span>
              {row.original.priceType && (
                <div className="text-xs text-text-muted capitalize">{row.original.priceType}</div>
              )}
            </div>
          ),
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <BatchStatusBadge status={row.original.status} />,
      },
    );
    if (canManage) {
      cols.push({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions
            label={`batch ${row.original.batchNumber}`}
            disabled={isDeleting}
            onEdit={() => {
              setEditing(row.original);
              setSheetOpen(true);
            }}
            onDelete={async () => {
              const confirmed = await confirmDanger({
                title: `Delete batch ${row.original.batchNumber}?`,
                text: "Batches used in orders or invoices cannot be deleted — mark them inactive instead.",
              });
              if (confirmed) remove(row.original);
            }}
          />
        ),
      });
    }
    return cols;
  }, [embedded, canManage, isDeleting, remove]);

  const addButton = canManage && (
    <Button
      size={embedded ? "sm" : "default"}
      onClick={() => {
        setEditing(null);
        setSheetOpen(true);
      }}
    >
      <Plus />
      {embedded ? "Add batch" : "New batch"}
    </Button>
  );

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      {!embedded && (
        <PageHeader
          title="Batches"
          description="Stock in the shared warehouse, by batch. Stock is deducted when batches are assigned to an order."
          action={addButton}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput onSearch={setSearch} placeholder="Search batch number or product…" />
        {!embedded && (
          <div className="w-64">
            <EntityCombobox
              value={productFilter}
              onChange={(v) => {
                setProductFilter(v);
                resetPage();
              }}
              options={productOptions}
              placeholder="All products"
              searchPlaceholder="Search products…"
              noneLabel="All products"
            />
          </div>
        )}
        <Select
          value={status || ALL}
          onValueChange={(v) => {
            setStatus(v === ALL ? "" : (v as BatchStatus));
            resetPage();
          }}
        >
          <SelectTrigger className="w-44" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(Object.keys(BATCH_STATUS_LABELS) as BatchStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {BATCH_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {embedded && <div className="ml-auto">{addButton}</div>}
      </div>

      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search || status || productFilter ? "No batches match these filters." : "No batches yet."}
          getRowId={(b) => b.id}
          {...tableProps}
        />
      )}

      <BatchFormSheet open={sheetOpen} onOpenChange={setSheetOpen} batch={editing} productId={productId} />
    </div>
  );
}
