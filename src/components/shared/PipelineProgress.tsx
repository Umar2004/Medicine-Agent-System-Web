"use client";

import { useQuery } from "@tanstack/react-query";
import { Boxes, Check, FileOutput, FileText, Info, Package, Receipt, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api-client";
import { ROLE_LABELS, ROLES, type PermissionKey, type Role } from "@/lib/constants";
import { describePipeline, type PipelineDeal, type PipelineStep } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

const ICONS: Record<PipelineStep, LucideIcon> = {
  quotation: FileText,
  proforma: FileOutput,
  batch_assignment: Boxes,
  commercial_invoice: Receipt,
  packing: Package,
};

/** "Warehouse Staff or Admin" — the specific roles first, admin last; owner only when nobody else can. */
function rolesText(roles: Role[] | undefined): string {
  const named = ROLES.filter((r) => r !== "owner" && roles?.includes(r));
  if (named.length === 0) return "the Owner";
  const ordered = [...named.filter((r) => r !== "admin"), ...named.filter((r) => r === "admin")].map((r) => ROLE_LABELS[r]);
  return ordered.length === 1 ? ordered[0] : `${ordered.slice(0, -1).join(", ")} or ${ordered.at(-1)}`;
}

/**
 * Where a deal is in QT → PI → batches → CI → packing, with links between its documents, the next
 * step, and — when the viewer can't do that step — who can ("waiting for Warehouse Staff").
 */
export function PipelineProgress({
  deal,
  here,
  canAct,
}: {
  deal: PipelineDeal;
  /** The document this page shows (marked "you are here" when it isn't the current step). */
  here: PipelineStep;
  /** The viewer is working in the deal's company (writes are possible at all). */
  canAct: boolean;
}) {
  const { can } = usePermissions();
  const view = describePipeline(deal);
  const holders = useQuery({
    queryKey: ["permissions", "holders"],
    queryFn: () => api.get<Partial<Record<PermissionKey, Role[]>>>("/api/permissions/holders"),
    staleTime: 5 * 60_000,
    enabled: !!view.next,
  });

  const next = view.next;
  const mine = !!next && canAct && can(next.permission);
  const currentIndex = view.steps.findIndex((s) => s.state === "current");
  const subtitle = next
    ? mine
      ? `Next: ${next.label}`
      : canAct
        ? `Waiting for ${holders.data ? rolesText(holders.data[next.permission]) : "…"}`
        : `Next: ${next.label}`
    : view.note;

  return (
    <div className="space-y-3">
      <nav aria-label="Deal progress" className="rounded-lg border bg-card px-4 py-3">
        <ol className="flex items-start">
          {view.steps.map((step, i) => {
            const Icon = ICONS[step.key];
            const isCurrent = step.state === "current";
            // On small screens only the current and the next step are shown.
            const narrowHidden = currentIndex === -1 ? i < view.steps.length - 2 : i !== currentIndex && i !== currentIndex + 1;
            const circle = (
              <span
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  step.state === "done" && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary bg-primary-light text-primary",
                  step.state === "upcoming" && "border-border bg-card text-text-muted",
                  step.state === "skipped" && "border-dashed border-border bg-card text-text-muted",
                )}
              >
                {step.state === "done" ? <Check className="size-4" /> : <Icon className="size-4" />}
                {isCurrent && (
                  <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                    <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                  </span>
                )}
              </span>
            );
            const label = (
              <span
                className={cn(
                  "text-xs leading-tight",
                  isCurrent ? "font-semibold text-foreground" : step.state === "done" ? "text-foreground" : "text-text-muted",
                )}
              >
                {step.label}
                {step.state === "skipped" && <span className="block text-[11px] text-text-muted">Skipped</span>}
                {step.key === here && !isCurrent && <span className="block text-[11px] text-text-muted">You are here</span>}
              </span>
            );
            const body = (
              <span className="flex flex-col items-center gap-1.5 text-center">
                {circle}
                {label}
              </span>
            );
            return (
              <li
                key={step.key}
                className={cn("flex min-w-0 flex-1 items-start", i === view.steps.length - 1 && "flex-none", narrowHidden && "hidden sm:flex")}
                aria-current={isCurrent ? "step" : undefined}
              >
                <div className="flex w-24 shrink-0 flex-col items-center sm:w-28">
                  {step.href && step.key !== here ? (
                    <Link
                      href={step.href}
                      className="rounded-md px-1 py-0.5 outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
                      title={`Open ${step.label.toLowerCase()}`}
                    >
                      {body}
                    </Link>
                  ) : (
                    <span className="px-1 py-0.5">{body}</span>
                  )}
                  {isCurrent && subtitle && (
                    <span className={cn("mt-1 px-1 text-center text-[11px] leading-tight", mine ? "font-medium text-primary" : "text-text-secondary")}>
                      {subtitle}
                    </span>
                  )}
                </div>
                {i < view.steps.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "mt-[18px] h-0.5 min-w-4 flex-1 rounded-full",
                      view.steps[i + 1].state === "done" || view.steps[i + 1].state === "current" ? "bg-primary" : "bg-border",
                      narrowHidden && "hidden sm:block",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
        {view.current === "done" && view.note && <p className="mt-2 text-center text-xs text-success-text">{view.note}</p>}
      </nav>

      {next && canAct && !mine && (
        <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-2.5 text-sm" role="status">
          <Info className="mt-0.5 size-4 shrink-0 text-info-text" />
          <span>
            <span className="font-medium">Next step: {next.label}</span>
            <span className="text-text-secondary">
              {" "}
              — waiting for {holders.data ? rolesText(holders.data[next.permission]) : "someone with access"}.
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
