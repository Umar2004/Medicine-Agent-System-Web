"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useCompanyStore } from "@/stores/company-store";
import type { SessionInfo } from "@/types/entities";

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<SessionInfo>("/api/auth/me"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ loggedOut: boolean }>("/api/auth/logout"),
    onSettled: () => {
      queryClient.clear();
      useCompanyStore.getState().setCompanyId(null);
      window.location.assign("/login");
    },
  });
}
