"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProductFormSheet } from "@/components/forms/ProductFormSheet";
import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { StockBadge } from "@/components/shared/StockBadge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import type { Product } from "@/types/entities";

export function ProductsTable() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("manage_products");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "productNumber", desc: false }]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const sort = sorting[0];
  const query = useQuery({
    queryKey: ["products", { search, page, pageSize, sortBy: sort?.id, desc: sort?.desc }],
    queryFn: () =>
      api.list<Product>("/api/products", {
        search,
        page,
        pageSize,
        sortBy: sort?.id,
        sortDir: sort?.desc ? "desc" : "asc",
      }),
    placeholderData: keepPreviousData,
  });

  const { mutate: deleteProduct, isPending: isDeleting } = useMutation({
    mutationFn: (product: Product) => api.del<{ id: string }>(`/api/products/${product.id}`),
    onSuccess: (_data, product) => {
      toast.success(`${product.productNumber} deleted`);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete product"),
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const columns = useMemo<ColumnDef<Product, unknown>[]>(() => {
    const cols: ColumnDef<Product, unknown>[] = [
      {
        id: "productNumber",
        header: "Number",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.productNumber}</span>,
      },
      {
        id: "brandName",
        header: "Brand name",
        cell: ({ row }) => <span className="font-medium">{row.original.brandName}</span>,
      },
      {
        id: "genericName",
        header: "Generic name",
        cell: ({ row }) => row.original.genericName ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "manufacturerName",
        header: "Manufacturer",
        cell: ({ row }) => row.original.manufacturerName ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "unit",
        header: "Unit",
        enableSorting: false,
        cell: ({ row }) => row.original.unit ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "totalStock",
        header: "Total stock",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-mono">{row.original.totalStock.toLocaleString()}</span>
            <StockBadge totalStock={row.original.totalStock} threshold={row.original.lowStockThreshold} />
          </div>
        ),
      },
    ];
    if (canManage) {
      cols.push({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${row.original.brandName}`}
              onClick={() => {
                setEditing(row.original);
                setSheetOpen(true);
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Delete ${row.original.brandName}`}
              disabled={isDeleting}
              onClick={async () => {
                const confirmed = await confirmDanger({
                  title: `Delete ${row.original.brandName}?`,
                  text: `${row.original.productNumber} will be removed from the product list. Products that still have batches cannot be deleted.`,
                });
                if (confirmed) deleteProduct(row.original);
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ),
      });
    }
    return cols;
  }, [canManage, deleteProduct, isDeleting]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Shared product catalogue for all companies."
        action={
          canManage && (
            <Button onClick={openCreate}>
              <Plus />
              New product
            </Button>
          )
        }
      />

      <SearchInput onSearch={handleSearch} placeholder="Search brand, generic name or number…" />

      {query.isError ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-destructive">
          {errorMessage(query.error)}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          sorting={sorting}
          onSortingChange={(s) => {
            setSorting(s);
            setPage(1);
          }}
          isLoading={query.isLoading}
          emptyMessage={search ? `No products match “${search}”.` : "No products yet."}
          onRowClick={(p) => router.push(`/products/${p.id}`)}
          getRowId={(p) => p.id}
        />
      )}

      <ProductFormSheet open={sheetOpen} onOpenChange={setSheetOpen} product={editing} />
    </div>
  );
}
