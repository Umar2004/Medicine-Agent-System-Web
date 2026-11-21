"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiClientError } from "@/lib/api-client";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Don't retry client errors (validation, permission, not found).
        retry: (failureCount, error) =>
          !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
    },
  });
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="top-right" richColors closeButton theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
