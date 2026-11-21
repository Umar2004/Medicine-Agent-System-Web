"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CustomerFormSheet } from "@/components/forms/CustomerFormSheet";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { RowActions } from "@/components/shared/RowActions";
import { SearchInput } from "@/components/shared/SearchInput";
import { SelectCompanyNotice } from "@/components/shared/SelectCompanyNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import type { Customer } from "@/types/entities";

const muted = <span className="text-text-muted">—</span>;

export function CustomersTable() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { companyId, isAllCompanies } = useCompany();
  const canManage = can("manage_customers") && !isAllCompanies;
  const { params, search, setSearch, tableProps } = useServerTable({ id: "customerNumber" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const query = useQuery({
    queryKey: ["customers", companyId, params],
    queryFn: () => api.list<Customer>("/api/customers", params),
    placeholderData: keepPreviousData,
  });

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (c: Customer) => api.del<{ id: string }>(`/api/customers/${c.id}`),
    onSuccess: (_d, c) => {
      toast.success(`${c.name} deleted`);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete customer"),
  });

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(() => {
    const cols: ColumnDef<Customer, unknown>[] = [
      {
        id: "customerNumber",
        header: "Number",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.customerNumber}</span>,
      },
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono">
            {row.original.code}
          </Badge>
        ),
      },
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name || muted}</div>
            {row.original.contactPerson && (
              <div className="text-xs text-text-muted">Attn: {row.original.contactPerson}</div>
            )}
          </div>
        ),
      },
      { id: "businessName", header: "Business name", cell: ({ row }) => row.original.businessName ?? muted },
      {
        id: "contact",
        header: "Contact",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.phone || row.original.email ? (
            <div className="text-xs">
              {row.original.phone && <div>{row.original.phone}</div>}
              {row.original.email && <div className="text-text-secondary">{row.original.email}</div>}
            </div>
          ) : (
            muted
          ),
      },
      {
        id: "country",
        header: "Location",
        cell: ({ row }) =>
          [row.original.city, row.original.country].filter(Boolean).join(", ") || muted,
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
                title: `Delete ${row.original.name || row.original.businessName}?`,
                text: "Past quotations and invoices keep their history. Customers with open quotations or orders cannot be deleted.",
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
        title="Customers"
        description="Customers of the selected company."
        action={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus />
              New customer
            </Button>
          )
        }
      />
      {isAllCompanies && can("manage_customers") && <SelectCompanyNotice what="customers" />}
      <SearchInput onSearch={setSearch} placeholder="Search name, code, number, email…" />
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search ? `No customers match “${search}”.` : "No customers yet."}
          getRowId={(c) => c.id}
          {...tableProps}
        />
      )}
      <CustomerFormSheet open={sheetOpen} onOpenChange={setSheetOpen} customer={editing} />
    </div>
  );
}
