import { CircleAlert } from "lucide-react";
import { forwardRef, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { monYY } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Batch } from "@/types/entities";
import type { MatchKind } from "./allocation";

const lkr = (v: number) => v.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Keys a whole-number quantity field must never accept. */
const BLOCKED_KEYS = new Set([".", ",", "-", "+", "e", "E"]);

/**
 * One available batch: number, MFD/EXP match tag (full match highlights the card), metadata and
 * the quantity to take from it. `available` is the batch stock minus what other lines of this PI take.
 */
export const BatchCard = forwardRef<
  HTMLInputElement,
  {
    batch: Batch;
    match: MatchKind;
    available: number;
    quantity: number;
    onQuantityChange: (qty: number) => void;
    /** Enter in the quantity field → next batch's field. */
    onEnter: () => void;
  }
>(function BatchCard({ batch, match, available, quantity, onQuantityChange, onEnter }, ref) {
  const inputId = `batch-qty-${batch.id}`;
  const exceeds = quantity > available;
  const sharedStock = available < batch.stockQuantity;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (BLOCKED_KEYS.has(e.key)) e.preventDefault();
    else if (e.key === "Enter") {
      e.preventDefault();
      onEnter();
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        match === "full" ? "border-primary/40 bg-primary/5" : "border-border bg-card",
        exceeds && "border-destructive/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium">{batch.batchNumber}</span>
        {match === "full" && (
          <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">MFD/EXP match</span>
        )}
        {(match === "mfd" || match === "exp") && (
          <span className="rounded-md border border-primary/40 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            {match === "mfd" ? "MFD match" : "EXP match"}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
        <span>
          MFD: <span className={cn("font-mono", (match === "full" || match === "mfd") && "font-semibold text-primary")}>{monYY(batch.mfd)}</span>
        </span>
        <span aria-hidden className="text-text-muted">|</span>
        <span>
          EXP: <span className={cn("font-mono", (match === "full" || match === "exp") && "font-semibold text-primary")}>{monYY(batch.exp)}</span>
        </span>
        <span aria-hidden className="text-text-muted">|</span>
        <span>
          Stock: <span className="font-mono">{batch.stockQuantity.toLocaleString()}</span>
        </span>
        <span aria-hidden className="text-text-muted">|</span>
        <span className="font-mono">{batch.costPrice === null ? "LKR —" : `LKR ${lkr(batch.costPrice)}`}</span>
        {batch.supplierName && (
          <>
            <span aria-hidden className="text-text-muted">|</span>
            <span>{batch.supplierName}</span>
          </>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={inputId} className="text-text-secondary">
          Assign qty:
        </label>
        <Input
          ref={ref}
          id={inputId}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={quantity || ""}
          placeholder="0"
          aria-invalid={exceeds || undefined}
          aria-describedby={exceeds ? `${inputId}-err` : undefined}
          className="h-8 w-20 text-right font-mono"
          onKeyDown={onKeyDown}
          onChange={(e) => {
            const n = Number(e.target.value);
            onQuantityChange(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
          }}
        />
        <span className="text-text-secondary">
          of <span className="font-mono">{available.toLocaleString()}</span> available
          {sharedStock && <span className="text-text-muted"> (rest taken by another line)</span>}
        </span>
      </div>

      {exceeds && (
        <p id={`${inputId}-err`} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert className="size-3.5" />
          Exceeds available stock ({available.toLocaleString()})
        </p>
      )}
    </div>
  );
});
