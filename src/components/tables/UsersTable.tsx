"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, MoreHorizontal, Pencil, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ResetPasswordSheet } from "@/components/forms/ResetPasswordSheet";
import { UserFormSheet } from "@/components/forms/UserFormSheet";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { canManageRole, ROLE_LABELS, ROLES } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { ManagedUser } from "@/types/entities";

const muted = <span className="text-text-muted">—</span>;

type UserAction = { user: ManagedUser; kind: "deactivate" | "reactivate" | "delete" };

export function UsersTable() {
  const queryClient = useQueryClient();
  const { can, isOwner } = usePermissions();
  const { data: session } = useSession();
  const canManage = can("manage_users");
  const { params, search, setSearch, resetPage, tableProps } = useServerTable({ id: "fullName" });
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);

  const filters = { ...params, role: role === "all" ? "" : role, status: status === "all" ? "" : status };
  const query = useQuery({
    queryKey: ["users", filters],
    queryFn: () => api.list<ManagedUser>("/api/users", filters),
    placeholderData: keepPreviousData,
  });

  const { mutate: act, isPending } = useMutation({
    mutationFn: ({ user, kind }: UserAction) =>
      kind === "delete" ? api.del<{ id: string }>(`/api/users/${user.id}`) : api.post<ManagedUser>(`/api/users/${user.id}/${kind}`),
    onSuccess: (_d, { user, kind }) => {
      toast.success(`${user.fullName} ${kind === "delete" ? "deleted" : kind === "deactivate" ? "deactivated" : "reactivated"}`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const myId = session?.user.id;
  const myRole = session?.user.role;

  const columns = useMemo<ColumnDef<ManagedUser, unknown>[]>(() => {
    const cols: ColumnDef<ManagedUser, unknown>[] = [
      {
        id: "fullName",
        header: "Name",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.fullName}
              {row.original.id === myId && <span className="ml-1.5 text-xs font-normal text-text-muted">(you)</span>}
            </div>
            <div className="text-xs text-text-muted">@{row.original.username}</div>
          </div>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.email || row.original.phone ? (
            <div className="text-xs">
              {row.original.email && <div>{row.original.email}</div>}
              {row.original.phone && <div className="text-text-secondary">{row.original.phone}</div>}
            </div>
          ) : (
            muted
          ),
      },
      { id: "role", header: "Role", cell: ({ row }) => ROLE_LABELS[row.original.role] },
      {
        id: "companies",
        header: "Companies",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.role === "owner" ? (
            <span className="text-text-secondary">All companies</span>
          ) : row.original.companies.length ? (
            <span className="text-xs">{row.original.companies.map((c) => c.name).join(", ")}</span>
          ) : (
            <span className="text-xs text-warning">None assigned</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.status === "active" ? (
            <Badge className="bg-success/15 text-success-text">Active</Badge>
          ) : (
            <Badge className="bg-muted text-text-secondary">Inactive</Badge>
          ),
      },
      {
        id: "lastLoginAt",
        header: "Last login",
        cell: ({ row }) => <span className="text-xs">{row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : "Never"}</span>,
      },
    ];
    if (canManage && myRole) {
      cols.push({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          if (u.id === myId || !canManageRole(myRole, u.role)) return null;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.fullName}`} disabled={isPending}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(u);
                      setSheetOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setResetting(u)}>
                    <KeyRound className="size-4" />
                    Reset password
                  </DropdownMenuItem>
                  {u.status === "active" ? (
                    <DropdownMenuItem
                      onSelect={async () => {
                        const ok = await confirmDanger({
                          title: `Deactivate ${u.fullName}?`,
                          text: "They are signed out right away and can't sign in until reactivated. Their records stay.",
                          confirmText: "Deactivate",
                        });
                        if (ok) act({ user: u, kind: "deactivate" });
                      }}
                    >
                      <UserX className="size-4" />
                      Deactivate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => act({ user: u, kind: "reactivate" })}>
                      <UserCheck className="size-4" />
                      Reactivate
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={async () => {
                      const ok = await confirmDanger({
                        title: `Delete ${u.fullName}?`,
                        text: "They can no longer sign in. Their name stays on past records and the audit log, and the username can't be reused.",
                      });
                      if (ok) act({ user: u, kind: "delete" });
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      });
    }
    return cols;
  }, [canManage, myId, myRole, isPending, act]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={isOwner ? "Everyone with access, across all companies." : "People in your companies."}
        action={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus />
              New user
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput onSearch={setSearch} placeholder="Search name, username, email…" />
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-36" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search ? `No users match “${search}”.` : "No users found."}
          getRowId={(u) => u.id}
          {...tableProps}
        />
      )}
      <UserFormSheet open={sheetOpen} onOpenChange={setSheetOpen} user={editing} />
      <ResetPasswordSheet user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}
