"use client";

import { ArrowLeft, ArrowRight, CircleAlert, PackageX, Sparkles, TriangleAlert } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { monYY } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Batch, OrderItemDetail } from "@/types/entities";
import { availableFor, matchKind, sortBatches, type Allocation } from "./allocation";
import { BatchCard } from "./BatchCard";
import { ProgressBar } from "./ProgressBar";

/**
 * Right panel: the selected product's requested / assigned / remaining, its available batches
 * (MFD/EXP matches first) and Previous / Next. Next only works once this product matches exactly.
 */
export function BatchAssignmentPanel({
  line,
  batches,
  alloc,
  onQuantityChange,
  onAutoFill,
  position,
  total,
  onPrevious,
  onNext,
  nextLabel,
  nextDisabled,
  nextHint,
}: {
  line: OrderItemDetail;
  /** undefined while loading. */
  batches: Batch[] | undefined;
  alloc: Allocation;
  onQuantityChange: (batchId: string, qty: number) => void;
  onAutoFill: () => void;
  /** 1-based position in the PI. */
  position: number;
  total: number;
  onPrevious: (() => void) | null;
  onNext: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  nextHint?: string;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nextRef = useRef<HTMLButtonElement>(null);

  const parts = alloc[line.id] ?? {};
  const assigned = Object.values(parts).reduce((s, q) => s + q, 0);
  const remaining = line.quantity - assigned;
  const sorted = batches ? sortBatches(line, batches) : [];
  const exceedsAny = sorted.some((b) => (parts[b.id] ?? 0) > availableFor(alloc, line.id, b));
  const exact = remaining === 0 && !exceedsAny;
  const totalAvailable = sorted.reduce((s, b) => s + availableFor(alloc, line.id, b), 0);

  function focusNext(i: number) {
    const next = inputRefs.current[i + 1];
    if (next) {
      next.focus();
      next.select();
    } else nextRef.current?.focus();
  }

  return (
    <section aria-label={`Batches for ${line.brandName}`} className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="space-y-3 border-b p-4">
        <div>
          <h2 className="text-base font-medium">{line.brandName}</h2>
          <p className="text-[13px] text-text-secondary">
            {[line.genericName, line.unit, line.country].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            PI line MFD <span className="font-mono">{monYY(line.mfd)}</span> · EXP <span className="font-mono">{monYY(line.exp)}</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Requested" value={line.quantity.toLocaleString()} />
          <Metric label="Assigned" value={assigned.toLocaleString()} />
          <Metric
            label={remaining < 0 ? "Over" : "Remaining"}
            value={Math.abs(remaining).toLocaleString()}
            tone={remaining === 0 ? "success" : "danger"}
          />
        </div>
        <ProgressBar
          value={assigned}
          max={line.quantity}
          label={`${line.brandName}: ${assigned} of ${line.quantity} assigned`}
          tone={exact ? "success" : remaining < 0 || exceedsAny ? "danger" : "warning"}
        />
      </div>

      {/* Batches */}
      <div key={line.id} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Available batches ({batches?.length ?? "…"})</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-primary"
            disabled={!batches || batches.length === 0 || remaining <= 0}
            onClick={onAutoFill}
          >
            <Sparkles />
            Auto-fill remaining
          </Button>
        </div>

        {!batches ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-text-secondary">
            <PackageX className="size-6 text-text-muted" />
            <p className="font-medium text-foreground">No batches available</p>
            <p>No batch of this product is in stock, active and unexpired. Add stock on the Batches page first.</p>
          </div>
        ) : (
          <>
            {totalAvailable < line.quantity && (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-text">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                Only {totalAvailable.toLocaleString()} available across all batches —{" "}
                {(line.quantity - totalAvailable).toLocaleString()} short of the {line.quantity.toLocaleString()} requested.
              </p>
            )}
            {sorted.map((b, i) => (
              <BatchCard
                key={b.id}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                batch={b}
                match={matchKind(line, b)}
                available={availableFor(alloc, line.id, b)}
                quantity={parts[b.id] ?? 0}
                onQuantityChange={(q) => onQuantityChange(b.id, q)}
                onEnter={() => focusNext(i)}
              />
            ))}
            {remaining > 0 && (
              <Warning>
                {remaining.toLocaleString()} remaining — total must equal requested ({line.quantity.toLocaleString()}) to proceed
              </Warning>
            )}
            {remaining < 0 && (
              <Warning>
                Over-assigned by {(-remaining).toLocaleString()} — total must equal requested ({line.quantity.toLocaleString()})
              </Warning>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        <span className="text-sm text-text-secondary">
          Product {position} of {total}
        </span>
        <div className="flex items-center gap-2">
          {nextDisabled && nextHint && <span className="hidden text-xs text-text-muted sm:inline">{nextHint}</span>}
          <Button type="button" variant="outline" size="sm" disabled={!onPrevious} onClick={() => onPrevious?.()}>
            <ArrowLeft />
            Previous
          </Button>
          <Button ref={nextRef} type="button" size="sm" disabled={nextDisabled} onClick={onNext}>
            {nextLabel}
            <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[11px] tracking-wide text-text-muted uppercase">{label}</div>
      <div
        className={cn(
          "font-mono text-lg font-semibold",
          tone === "success" && "text-success-text",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 pt-1 text-sm font-medium text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
