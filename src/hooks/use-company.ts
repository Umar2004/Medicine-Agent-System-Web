"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useSession } from "@/hooks/use-auth";
import { useCompanyStore } from "@/stores/company-store";

/**
 * Active company. Owner may be in "All companies" mode (companyId = null).
 * Other roles are always pinned to one of their assigned companies.
 */
export function useCompany() {
  const { data: session } = useSession();
  const companyId = useCompanyStore((s) => s.companyId);
  const setCompanyId = useCompanyStore((s) => s.setCompanyId);
  const queryClient = useQueryClient();

  const companies = useMemo(() => session?.companies ?? [], [session]);
  const isOwner = session?.user.role === "owner";

  // Keep the stored selection valid for this user.
  useEffect(() => {
    if (!session) return;
    const valid = companyId && companies.some((c) => c.id === companyId);
    if (valid) return;
    if (isOwner) {
      if (companyId) setCompanyId(null);
      return;
    }
    const fallback = companies.find((c) => c.isDefault) ?? companies[0];
    setCompanyId(fallback?.id ?? null);
  }, [session, companies, companyId, isOwner, setCompanyId]);

  const switchCompany = useCallback(
    (id: string | null) => {
      if (id === companyId) return;
      setCompanyId(id);
      // Everything company-scoped must re-fetch; keep the session itself.
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "session" });
    },
    [companyId, setCompanyId, queryClient],
  );

  return {
    companyId,
    companies,
    currentCompany: companies.find((c) => c.id === companyId) ?? null,
    isAllCompanies: isOwner && companyId === null,
    canChooseAll: isOwner,
    switchCompany,
  };
}
