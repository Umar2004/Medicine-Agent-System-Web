"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { COMPANY_COOKIE } from "@/lib/constants";

interface CompanyState {
  /** null = owner's "All companies" mode (or not chosen yet). */
  companyId: string | null;
  setCompanyId: (id: string | null) => void;
}

function writeCookie(id: string | null): void {
  if (typeof document === "undefined") return;
  document.cookie = id
    ? `${COMPANY_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    : `${COMPANY_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
      companyId: null,
      setCompanyId: (id) => {
        writeCookie(id);
        set({ companyId: id });
      },
    }),
    {
      name: "ma-company",
      onRehydrateStorage: () => (state) => writeCookie(state?.companyId ?? null),
    },
  ),
);
