"use client";

import { Bell, KeyRound, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CompanySelector } from "@/components/layout/CompanySelector";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useLogout, useSession } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/constants";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Topbar() {
  const { data: session } = useSession();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-card px-6">
      <CompanySelector />

      <div className="relative ml-auto hidden w-full max-w-xs md:block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted" />
        {/* Global search is wired up in a later phase. */}
        <Input placeholder="Search…" className="h-9 pl-8" disabled aria-label="Search (coming soon)" />
      </div>

      <ThemeToggle />

      <Button variant="ghost" size="icon" aria-label="Notifications" className="text-muted-foreground">
        <Bell className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary-light text-xs font-semibold text-primary">
                {session ? initials(session.user.fullName) : ""}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {session && (
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{session.user.fullName}</p>
              <p className="text-xs text-muted-foreground">
                @{session.user.username} · {ROLE_LABELS[session.user.role]}
              </p>
            </DropdownMenuLabel>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <KeyRound className="size-4" />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
