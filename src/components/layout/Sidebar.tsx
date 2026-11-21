"use client";

import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Factory,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pill,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { NAV_GROUPS } from "@/lib/navigation";
import { useAuthUiStore } from "@/stores/auth-store";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Pill,
  Boxes,
  Factory,
  FileText,
  ClipboardList,
  Receipt,
  Package,
  Users,
  Truck,
  Landmark,
  TrendingUp,
  BarChart3,
  UserCog,
  ShieldCheck,
  ScrollText,
  Building2,
  Settings,
};

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useAuthUiStore((s) => s.sidebarCollapsed);
  const toggle = useAuthUiStore((s) => s.toggleSidebar);
  const { canSee, ready } = usePermissions();
  const { data: session } = useSession();

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.isDefault || canSee(i.route)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-[260px]",
      )}
    >
      <div className={cn("flex h-16 items-center gap-3 border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
          M
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">Medicine Agent</p>
            <p className="truncate text-xs text-sidebar-muted">Vexora Labs</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {!ready && (
          <div className="space-y-2 px-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-sidebar-accent" />
            ))}
          </div>
        )}
        {ready &&
          groups.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <p className="mb-1 px-3 text-[11px] font-medium tracking-wider text-sidebar-muted uppercase">{group.label}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutDashboard;
                  const active = pathname === item.route || pathname.startsWith(`${item.route}/`);
                  const link = (
                    <Link
                      href={item.route}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </Link>
                  );
                  return (
                    <li key={item.route}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">{item.title}</TooltipContent>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        {!collapsed && session && (
          <div className="mb-2 px-3 py-1">
            <p className="truncate text-sm font-medium text-sidebar-accent-foreground">{session.user.fullName}</p>
            <p className="truncate text-xs text-sidebar-muted">{ROLE_LABELS[session.user.role]}</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
