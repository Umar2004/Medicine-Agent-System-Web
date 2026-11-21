"use client";

import { create } from "zustand";

// The session itself lives in the TanStack Query cache (see hooks/use-auth.ts).
// This store only holds UI state tied to the signed-in user.

interface AuthUiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useAuthUiStore = create<AuthUiState>()((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
