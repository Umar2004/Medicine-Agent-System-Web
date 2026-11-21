"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OrderItemDetail } from "@/types/entities";
import type { LineStatus } from "./allocation";
import { ProductListItem } from "./ProductListItem";

type Filter = "all" | LineStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "done", label: "Done" },
];
const STATUS_RANK: Record<LineStatus, number> = { done: 0, partial: 1, pending: 2 };

/**
 * Left panel: search, status filter chips and the product rows (done → partial → pending, then the
 * PI's own order). ↑/↓ move the selection. Below 1024px it collapses behind a toggle.
 */
export function ProductList({
  lines,
  statuses,
  assigned,
  selectedId,
  onSelect,
}: {
  /** In the PI's sort order. */
  lines: OrderItemDetail[];
  statuses: Record<string, LineStatus>;
  assigned: Record<string, number>;
  selectedId: string | null;
  onSelect: (lineId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(true);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: lines.length, pending: 0, partial: 0, done: 0 };
    for (const l of lines) c[statuses[l.id] ?? "pending"]++;
    return c;
  }, [lines, statuses]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines
      .map((line, index) => ({ line, index, status: statuses[line.id] ?? "pending" }))
      .filter(
        (r) =>
          (filter === "all" || r.status === filter) &&
          (!q || r.line.brandName.toLowerCase().includes(q) || (r.line.genericName ?? "").toLowerCase().includes(q)),
      )
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.index - b.index);
  }, [lines, statuses, search, filter]);

  // Keep the selected row in view when the selection changes (Next/Previous, arrow keys).
  useEffect(() => {
    if (selectedId) rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function onKeyDown(e: KeyboardEvent<HTMLLIElement>, i: number) {
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(visible.length - 1, i + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = visible.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(visible[i].line.id);
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    const id = visible[next].line.id;
    onSelect(id);
    rowRefs.current.get(id)?.focus();
  }

  const selectedLine = lines.find((l) => l.id === selectedId);

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
      <button
        type="button"
        className="flex items-center justify-between gap-2 border-b px-3 py-2.5 text-left text-sm lg:hidden"
        aria-expanded={open}
        aria-controls="batch-product-list"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0 truncate">
          <span className="font-medium">Products ({lines.length})</span>
          {!open && selectedLine && <span className="text-text-secondary"> · {selectedLine.brandName}</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      <div id="batch-product-list" className={cn("min-h-0 flex-1 flex-col", open ? "flex" : "hidden lg:flex")}>
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brand or generic name"
              aria-label="Search products"
              className="h-8 pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  filter === f.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-text-secondary hover:bg-muted",
                )}
              >
                {f.label} ({counts[f.value]})
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-secondary">No products match.</p>
        ) : (
          <ul
            role="listbox"
            aria-label="Products on this proforma invoice"
            className="max-h-80 min-h-0 flex-1 overflow-y-auto lg:max-h-none"
          >
            {visible.map((r, i) => (
              <ProductListItem
                key={r.line.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(r.line.id, el);
                  else rowRefs.current.delete(r.line.id);
                }}
                line={r.line}
                status={r.status}
                assigned={assigned[r.line.id] ?? 0}
                selected={r.line.id === selectedId}
                tabbable={r.line.id === selectedId || (i === 0 && !visible.some((v) => v.line.id === selectedId))}
                onSelect={() => onSelect(r.line.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
