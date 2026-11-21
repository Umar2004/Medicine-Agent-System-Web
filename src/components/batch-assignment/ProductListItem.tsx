import { Check } from "lucide-react";
import { forwardRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { OrderItemDetail } from "@/types/entities";
import { STATUS_LABEL, type LineStatus } from "./allocation";

const DOT: Record<LineStatus, string> = {
  pending: "bg-text-muted/60",
  partial: "bg-warning",
  done: "bg-success",
};

/** One row of the product list: status dot, brand + generic name, assigned/requested. */
export const ProductListItem = forwardRef<
  HTMLLIElement,
  {
    line: OrderItemDetail;
    status: LineStatus;
    assigned: number;
    selected: boolean;
    /** Roving tab stop: the selected row, or the first row when the selection is filtered out. */
    tabbable: boolean;
    onSelect: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLLIElement>) => void;
  }
>(function ProductListItem({ line, status, assigned, selected, tabbable, onSelect, onKeyDown }, ref) {
  return (
    <li
      ref={ref}
      id={`line-${line.id}`}
      role="option"
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex cursor-pointer items-center gap-3 border-b border-l-3 border-l-transparent px-3 py-2.5 outline-none last:border-b-0",
        "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected && "border-l-primary bg-primary/10 hover:bg-primary/10",
      )}
    >
      <span className={cn("size-2.5 shrink-0 rounded-full", DOT[status])} aria-hidden />
      <span className="sr-only">{STATUS_LABEL[status]}: </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{line.brandName}</div>
        <div className="truncate text-[11px] text-text-secondary">{line.genericName || "—"}</div>
      </div>
      {status === "done" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success/15 px-1.5 py-0.5 font-mono text-xs font-medium text-success-text">
          <Check className="size-3" aria-hidden />
          {assigned.toLocaleString()}/{line.quantity.toLocaleString()}
        </span>
      ) : status === "partial" ? (
        <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 font-mono text-xs font-medium text-warning-text">
          {assigned.toLocaleString()}/{line.quantity.toLocaleString()}
        </span>
      ) : (
        <span className="shrink-0 text-right leading-tight">
          <span className="block font-mono text-xs">{line.quantity.toLocaleString()}</span>
          <span className="block text-[10px] text-text-muted">requested</span>
        </span>
      )}
    </li>
  );
});
