"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/entities";

const haystack = (p: Product) =>
  [p.brandName, p.genericName, p.productNumber, p.manufacturerName, p.unit].filter(Boolean).join(" ").toLowerCase();

/**
 * Search-and-click product list for the quotation items step. Filters the cached product list
 * in the browser; if the catalogue is bigger than that list, typing searches the server instead.
 * Arrow keys move, Enter adds, Escape clears.
 */
export function ProductPickerPanel({
  products,
  totalCount,
  loading,
  addedCounts,
  onPick,
  className,
}: {
  products: Product[];
  totalCount: number;
  loading: boolean;
  addedCounts: Map<string, number>;
  onPick: (product: Product) => void;
  className?: string;
}) {
  const listId = useId();
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebounce(term.trim(), 300);
  const partial = totalCount > products.length;

  const remote = useQuery({
    queryKey: ["products", "search", debounced],
    queryFn: () => api.list<Product>("/api/products", { search: debounced, pageSize: 100, sortBy: "brandName" }),
    enabled: partial && debounced.length > 0,
    staleTime: 60_000,
  });

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return products;
    if (partial) return remote.data?.data ?? [];
    const tokens = q.split(/\s+/);
    const hits = products.filter((p) => {
      const text = haystack(p);
      return tokens.every((t) => text.includes(t));
    });
    // Brand names starting with the search come first.
    return [...hits].sort((a, b) => Number(!a.brandName.toLowerCase().startsWith(q)) - Number(!b.brandName.toLowerCase().startsWith(q)));
  }, [term, products, partial, remote.data]);

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const optionId = (i: number) => `${listId}-opt-${i}`;

  function move(to: number) {
    const next = Math.max(0, Math.min(results.length - 1, to));
    setActive(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") move(activeIndex + 1);
    else if (e.key === "ArrowUp") move(activeIndex - 1);
    else if (e.key === "PageDown") move(activeIndex + 8);
    else if (e.key === "PageUp") move(activeIndex - 8);
    else if (e.key === "Enter") {
      const product = results[activeIndex];
      if (product) {
        onPick(product);
        // Typing the next search replaces this one.
        e.currentTarget.select();
      }
    } else if (e.key === "Escape" && term) setTerm("");
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const searching = partial && !!term.trim() && (remote.isFetching || debounced !== term.trim());

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={results.length ? optionId(activeIndex) : undefined}
            aria-label="Search products to add"
            placeholder="Search products…"
            autoComplete="off"
            className="pr-8 pl-8"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          {term && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-foreground"
              onClick={() => setTerm("")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-text-muted">Click or press Enter to add · ↑↓ to move</p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div id={listId} role="listbox" aria-label="Products" className="p-1.5">
          {loading || searching ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-muted">
              <Loader2 className="size-4 animate-spin" />
              {loading ? "Loading products…" : "Searching…"}
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-text-muted">
              {term ? `No products match “${term.trim()}”.` : "No products yet. Add them on the Products page."}
            </p>
          ) : (
            results.map((p, i) => {
              const count = addedCounts.get(p.id) ?? 0;
              return (
                <div
                  key={p.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  // Keep focus in the search box so typing continues after a click.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => onPick(p)}
                  className={cn(
                    "cursor-pointer rounded-md px-2.5 py-2 transition-colors",
                    i === activeIndex ? "bg-primary-light/60" : "hover:bg-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-foreground">{p.brandName}</span>
                    {count > 0 && (
                      <span
                        key={count}
                        className="shrink-0 animate-in rounded-full bg-primary px-1.5 py-px text-[10px] font-medium text-primary-foreground duration-300 zoom-in-50"
                      >
                        Added{count > 1 ? ` ×${count.toLocaleString()}` : ""}
                      </span>
                    )}
                  </div>
                  {p.genericName && <div className="truncate text-xs text-text-secondary">{p.genericName}</div>}
                  {(p.unit || p.manufacturerName) && (
                    <div className="truncate text-[11px] text-text-muted">
                      {[p.unit, p.manufacturerName].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="border-t px-3 py-2 text-[11px] text-text-muted">
        {partial && !term.trim()
          ? `Showing ${products.length} of ${totalCount.toLocaleString()} — type to search all`
          : `${results.length.toLocaleString()} product${results.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
