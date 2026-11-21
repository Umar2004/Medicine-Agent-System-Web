"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { confirmAction, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, PERMISSION_LABELS, ROLE_LABELS, ROLES } from "@/lib/constants";
import { DEFAULT_ROLE_MODULES } from "@/lib/navigation";
import type { PermissionMatrix } from "@/types/entities";

type RoleRow = PermissionMatrix["roles"][number];
type Field = "permissions" | "routes";

function sameMatrix(a: RoleRow[], b: RoleRow[]): boolean {
  const key = (rows: RoleRow[]) =>
    JSON.stringify(rows.map((r) => [r.role, [...r.permissions].sort(), [...r.routes].sort()]));
  return key(a) === key(b);
}

function MatrixTable({
  title,
  description,
  rows,
  isChecked,
  onToggle,
}: {
  title: string;
  description: string;
  rows: { id: string; label: string; hint?: string; locked?: boolean }[];
  isChecked: (role: RoleRow["role"], id: string) => boolean;
  onToggle: (role: RoleRow["role"], id: string, checked: boolean) => void;
}) {
  const roles = ROLES.filter((r): r is RoleRow["role"] => r !== "owner");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-text-secondary">{description}</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="text-xs text-text-secondary">
            <tr className="border-b">
              <th className="py-2 pr-3 text-left font-medium" />
              <th className="w-24 px-2 py-2 text-center font-medium">{ROLE_LABELS.owner}</th>
              {roles.map((r) => (
                <th key={r} className="w-24 px-2 py-2 text-center font-medium">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="py-2 pr-3">
                  <div className="font-medium">{row.label}</div>
                  {row.hint && <div className="text-xs text-text-muted">{row.hint}</div>}
                </td>
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" className="size-4 accent-primary" checked disabled aria-label={`${row.label}: Owner`} />
                </td>
                {roles.map((r) => (
                  <td key={r} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary disabled:opacity-40"
                      checked={row.locked ? true : isChecked(r, row.id)}
                      disabled={row.locked}
                      aria-label={`${row.label}: ${ROLE_LABELS[r]}`}
                      onChange={(e) => onToggle(r, row.id, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Owner-only matrix: what each role can do, and which sidebar pages it sees (CLAUDE.md §6). */
export function RolesEditor() {
  const queryClient = useQueryClient();
  const { isOwner } = usePermissions();
  const query = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api.get<PermissionMatrix>("/api/permissions"),
    enabled: isOwner,
  });
  // Local edits over the saved matrix; null = no edits yet.
  const [edits, setEdits] = useState<RoleRow[] | null>(null);
  const saved = query.data?.roles;
  const roles = edits ?? saved ?? [];
  const dirty = !!edits && !!saved && !sameMatrix(edits, saved);

  const save = useMutation({
    mutationFn: () => api.put<PermissionMatrix>("/api/permissions", { roles }),
    onSuccess: (matrix) => {
      queryClient.setQueryData(["permissions"], matrix);
      setEdits(null);
      toast.success("Permissions saved. They apply within a minute.");
    },
    onError: (err) => showError(errorMessage(err)),
  });

  function toggle(field: Field, role: RoleRow["role"], id: string, checked: boolean) {
    setEdits(
      roles.map((r) =>
        r.role !== role
          ? r
          : { ...r, [field]: checked ? [...(r[field] as string[]), id] : (r[field] as string[]).filter((v) => v !== id) },
      ),
    );
  }

  async function restoreDefaults() {
    const ok = await confirmAction({
      title: "Restore default permissions?",
      text: "Fills in the original matrix. Nothing changes until you save.",
      confirmText: "Restore",
    });
    if (!ok) return;
    setEdits(
      roles.map((r) => ({
        ...r,
        permissions: [...DEFAULT_ROLE_PERMISSIONS[r.role]],
        routes: DEFAULT_ROLE_MODULES[r.role],
      })),
    );
  }

  const header = (
    <PageHeader
      title="Roles & permissions"
      description="What each role can do, and which pages it sees in the sidebar."
      action={
        query.data && (
          <>
            <Button variant="outline" onClick={() => void restoreDefaults()} disabled={save.isPending}>
              <RotateCcw />
              Restore defaults
            </Button>
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Save changes
            </Button>
          </>
        )
      }
    />
  );

  if (query.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState error={query.error} />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const byRole = new Map(roles.map((r) => [r.role, r]));
  return (
    <div className="space-y-6">
      {header}
      <MatrixTable
        title="Actions"
        description="Create, edit, approve and so on."
        rows={PERMISSION_KEYS.map((k) => ({ id: k, label: PERMISSION_LABELS[k].label, hint: PERMISSION_LABELS[k].hint }))}
        isChecked={(role, id) => (byRole.get(role)?.permissions as string[] | undefined)?.includes(id) ?? false}
        onToggle={(role, id, checked) => toggle("permissions", role, id, checked)}
      />
      <MatrixTable
        title="Sidebar pages"
        description="A role can read the data on any page it can see. Dashboard and Settings are always visible."
        rows={query.data.modules
          .filter((m) => !m.ownerOnly)
          .map((m) => ({ id: m.route, label: m.title, locked: m.isDefault }))}
        isChecked={(role, id) => byRole.get(role)?.routes.includes(id) ?? false}
        onToggle={(role, id, checked) => toggle("routes", role, id, checked)}
      />
      <p className="text-xs text-text-muted">Companies and Roles are always owner-only.</p>
    </div>
  );
}
