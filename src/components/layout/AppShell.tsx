"use client";

import { Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { NAV_ITEMS } from "@/lib/navigation";

/** Pages are gated by sidebar visibility (CLAUDE.md §6); the API enforces the same rule. */
function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canSee, ready } = usePermissions();
  const item = NAV_ITEMS.find((i) => pathname === i.route || pathname.startsWith(`${i.route}/`));

  if (ready && item && !item.isDefault && !canSee(item.route)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Lock className="mb-3 size-8 text-text-muted" />
        <h2 className="text-lg font-semibold">No access</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your role doesn&apos;t have access to {item.title}.</p>
      </div>
    );
  }
  // Mount the page (hidden) while the session loads, so its data requests run in parallel with
  // the session request instead of waiting for it. The API enforces access either way.
  return (
    <>
      {!ready && <PageSkeleton />}
      <div className={ready ? "contents" : "hidden"}>{children}</div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-6">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
