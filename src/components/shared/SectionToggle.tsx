"use client";

import { useId, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface SectionToggleProps {
  /** e.g. "Freight & C&F", "Bank details", "Notes & other details". */
  label: string;
  /** Short line under the label explaining what the section adds to the document. */
  description?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** Locks the switch — e.g. a section enforced ON on a commercial invoice. */
  disabled?: boolean;
  /** Shown with a lock icon when the section is enforced (implies `disabled`). */
  enforcedReason?: string;
  /** The section's fields; rendered only while the section is ON. */
  children: ReactNode;
  className?: string;
}

/**
 * An optional document section (freight, bank details, other details) with an on/off switch.
 * Quotations default these OFF, proforma invoices ON; a commercial invoice enforces any the PI left out.
 * Turning a section off hides its fields; the values are kept and come back when it's turned on.
 */
export function SectionToggle({
  label,
  description,
  enabled,
  onChange,
  disabled,
  enforcedReason,
  children,
  className,
}: SectionToggleProps) {
  const id = useId();
  const locked = disabled || !!enforcedReason;

  return (
    <section
      className={cn(
        "rounded-lg border bg-card transition-colors",
        enabled ? "border-border" : "border-dashed border-border bg-background",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={id} className={cn("text-sm font-medium", locked ? "cursor-default" : "cursor-pointer")}>
            {label}
          </Label>
          {description && <p className="text-xs text-text-secondary">{description}</p>}
          {enforcedReason && (
            <p className="flex items-center gap-1.5 pt-1 text-xs font-medium text-warning-text">
              <Lock className="size-3 shrink-0" aria-hidden />
              {enforcedReason}
            </p>
          )}
        </div>
        <Switch
          id={id}
          checked={enabled}
          onCheckedChange={onChange}
          disabled={locked}
          aria-describedby={enforcedReason ? `${id}-enforced` : undefined}
        />
        {enforcedReason && (
          <span id={`${id}-enforced`} className="sr-only">
            {enforcedReason}
          </span>
        )}
      </div>
      {enabled && <div className="border-t border-border px-4 py-4">{children}</div>}
    </section>
  );
}
