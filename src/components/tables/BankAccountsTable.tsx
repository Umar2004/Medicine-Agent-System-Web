"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BankAccountFormSheet } from "@/components/forms/BankAccountFormSheet";
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
import type { BankAccount } from "@/types/entities";

const muted = <span className="text-text-muted">—</span>;

export function BankAccountsTable() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { companyId, isAllCompanies } = useCompany();
  const canManage = can("manage_bank_details") && !isAllCompanies;
  const { params, search, setSearch, tableProps } = useServerTable({ id: "bankName" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);

  const query = useQuery({
    queryKey: ["bank-details", companyId, params],
    queryFn: () => api.list<BankAccount>("/api/bank-details", params),
    placeholderData: keepPreviousData,
  });

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (b: BankAccount) => api.del<{ id: string }>(`/api/bank-details/${b.id}`),
    onSuccess: (_d, b) => {
      toast.success(`${b.bankName} account deleted`);
      void queryClient.invalidateQueries({ queryKey: ["bank-details"] });
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete bank account"),
  });

  const columns = useMemo<ColumnDef<BankAccount, unknown>[]>(() => {
    const cols: ColumnDef<BankAccount, unknown>[] = [
      { id: "bankName", header: "Bank", cell: ({ row }) => <span className="font-medium">{row.original.bankName}</span> },
      {
        id: "accountNumber",
        header: "Account number",
        cell: ({ row }) => <span className="font-mono">{row.original.accountNumber}</span>,
      },
      {
        id: "swiftCode",
        header: "SWIFT",
        enableSorting: false,
        cell: ({ row }) => (row.original.swiftCode ? <span className="font-mono">{row.original.swiftCode}</span> : muted),
      },
      { id: "branchName", header: "Branch", cell: ({ row }) => row.original.branchName ?? muted },
      {
        id: "otherDetails",
        header: "Other details",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.otherDetails ? (
            <span className="line-clamp-2 max-w-72 text-xs text-text-secondary">{row.original.otherDetails}</span>
          ) : (
            muted
          ),
      },
    ];
    if (isAllCompanies) {
      cols.unshift({
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
            label={row.original.bankName}
            disabled={isDeleting}
            onEdit={() => {
              setEditing(row.original);
              setSheetOpen(true);
            }}
            onDelete={async () => {
              const confirmed = await confirmDanger({
                title: `Delete ${row.original.bankName} (${row.original.accountNumber})?`,
                text: "This permanently deletes the account. Quotations using it will no longer show bank details. Accounts used on invoices cannot be deleted.",
                confirmText: "Delete permanently",
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
        title="Bank Accounts"
        description="Bank details printed on proforma invoices and invoices for the selected company."
        action={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus />
              New bank account
            </Button>
          )
        }
      />
      {isAllCompanies && can("manage_bank_details") && <SelectCompanyNotice what="bank accounts" />}
      <SearchInput onSearch={setSearch} placeholder="Search bank, account number, branch…" />
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search ? `No bank accounts match “${search}”.` : "No bank accounts yet."}
          getRowId={(b) => b.id}
          {...tableProps}
        />
      )}
      <BankAccountFormSheet open={sheetOpen} onOpenChange={setSheetOpen} account={editing} />
    </div>
  );
}
