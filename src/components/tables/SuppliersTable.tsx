"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SupplierFormSheet } from "@/components/forms/SupplierFormSheet";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { RowActions } from "@/components/shared/RowActions";
import { SearchInput } from "@/components/shared/SearchInput";
import { SelectCompanyNotice } from "@/components/shared/SelectCompanyNotice";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import type { Supplier } from "@/types/entities";

const muted = <span className="text-text-muted">—</span>;

export function SuppliersTable() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { companyId, isAllCompanies } = useCompany();
  const canManage = can("manage_suppliers") && !isAllCompanies;
  const { params, search, setSearch, tableProps } = useServerTable({ id: "supplierNumber" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const query = useQuery({
    queryKey: ["suppliers", companyId, params],
    queryFn: () => api.list<Supplier>("/api/suppliers", params),
    placeholderData: keepPreviousData,
  });

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (s: Supplier) => api.del<{ id: string }>(`/api/suppliers/${s.id}`),
    onSuccess: (_d, s) => {
      toast.success(`${s.name} deleted`);
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete supplier"),
  });

  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(() => {
    const cols: ColumnDef<Supplier, unknown>[] = [
      {
        id: "supplierNumber",
        header: "Number",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.supplierNumber}</span>,
      },
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            {row.original.contactPerson && (
              <div className="text-xs text-text-muted">Attn: {row.original.contactPerson}</div>
            )}
          </div>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        enableSorting: false,
        cell: ({ row }) => {
          const phones = [row.original.phone, row.original.contactNumber].filter(Boolean).join(" / ");
          return phones || row.original.email ? (
            <div className="text-xs">
              {phones && <div>{phones}</div>}
              {row.original.email && <div className="text-text-secondary">{row.original.email}</div>}
            </div>
          ) : (
            muted
          );
        },
      },
      { id: "city", header: "City", cell: ({ row }) => row.original.city ?? muted },
      { id: "country", header: "Country", cell: ({ row }) => row.original.country ?? muted },
    ];
    if (isAllCompanies) {
      cols.splice(1, 0, {
        id: "companyName",
        header: "Company",
        enableSorting: false,
        cell: ({ row }) => <span className="text-text-secondary">{row.original.companyName}</span>,
      });
    }
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
                text: "Suppliers linked to batches cannot be deleted. Price history is kept.",
              });
              if (confirmed) remove(row.original);
            }}
          />
        ),
      });
    }
    return cols;
  }, [isAllCompanies, canManage, isDeleting, remove]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Suppliers of the selected company. Batches can use suppliers from any company."
        action={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus />
              New supplier
            </Button>
          )
        }
      />
      {isAllCompanies && can("manage_suppliers") && <SelectCompanyNotice what="suppliers" />}
      <SearchInput onSearch={setSearch} placeholder="Search name, number, contact, city…" />
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search ? `No suppliers match “${search}”.` : "No suppliers yet."}
          getRowId={(s) => s.id}
          {...tableProps}
        />
      )}
      <SupplierFormSheet open={sheetOpen} onOpenChange={setSheetOpen} supplier={editing} />
    </div>
  );
}
