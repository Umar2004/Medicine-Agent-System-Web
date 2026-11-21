"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ManufacturerFormSheet } from "@/components/forms/ManufacturerFormSheet";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { RowActions } from "@/components/shared/RowActions";
import { SearchInput } from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import type { Manufacturer } from "@/types/entities";

const muted = <span className="text-text-muted">—</span>;

export function ManufacturersTable() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("manage_manufacturers");
  const { params, search, setSearch, tableProps } = useServerTable({ id: "name" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Manufacturer | null>(null);

  const query = useQuery({
    queryKey: ["manufacturers", params],
    queryFn: () => api.list<Manufacturer>("/api/manufacturers", params),
    placeholderData: keepPreviousData,
  });

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (m: Manufacturer) => api.del<{ id: string }>(`/api/manufacturers/${m.id}`),
    onSuccess: (_d, m) => {
      toast.success(`${m.name} deleted`);
      void queryClient.invalidateQueries({ queryKey: ["manufacturers"] });
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete manufacturer"),
  });

  const columns = useMemo<ColumnDef<Manufacturer, unknown>[]>(() => {
    const cols: ColumnDef<Manufacturer, unknown>[] = [
      {
        id: "manufacturerNumber",
        header: "Number",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.manufacturerNumber}</span>,
      },
      { id: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: "country", header: "Country", cell: ({ row }) => row.original.country ?? muted },
      {
        id: "contactInfo",
        header: "Contact",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.contactInfo ? (
            <span className="line-clamp-1 max-w-64 text-text-secondary">{row.original.contactInfo}</span>
          ) : (
            muted
          ),
      },
      {
        id: "productCount",
        header: "Products",
        cell: ({ row }) => <span className="font-mono">{row.original.productCount}</span>,
      },
    ];
    if (canManage) {
      cols.push({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions
            label={row.original.name}
            disabled={isDeleting}
            onEdit={() => {
              setEditing(row.original);
              setSheetOpen(true);
            }}
            onDelete={async () => {
              const confirmed = await confirmDanger({
                title: `Delete ${row.original.name}?`,
                text: "Manufacturers still used by products cannot be deleted.",
              });
              if (confirmed) remove(row.original);
            }}
          />
        ),
      });
    }
    return cols;
  }, [canManage, isDeleting, remove]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manufacturers"
        description="Shared manufacturer list, used on products and in the MNF column of invoices."
        action={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus />
              New manufacturer
            </Button>
          )
        }
      />
      <SearchInput onSearch={setSearch} placeholder="Search name, number or country…" />
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search ? `No manufacturers match “${search}”.` : "No manufacturers yet."}
          getRowId={(m) => m.id}
          {...tableProps}
        />
      )}
      <ManufacturerFormSheet open={sheetOpen} onOpenChange={setSheetOpen} manufacturer={editing} />
    </div>
  );
}
