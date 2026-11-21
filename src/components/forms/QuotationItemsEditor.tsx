"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormGetValues,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { toast } from "sonner";
import { MonthYearInput } from "@/components/forms/MonthYearInput";
import { ProductPickerPanel } from "@/components/forms/ProductPickerPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import { formatDate, formatUsd } from "@/lib/format";
import { lineTotalCents } from "@/lib/money";
import type { QuotationCreateInput } from "@/lib/validations/quotations";
import type { LastQuotedPrice, Product, ProductOption } from "@/types/entities";

export const emptyLine: QuotationCreateInput["items"][number] = {
  productId: "",
  mfd: "",
  exp: "",
  quantity: 1,
  unit: "",
  sellingPriceUsd: 0,
};

/** Matches the `items` max in documentFieldsSchema. */
const MAX_LINES = 200;

/**
 * Product lines for a quotation or proforma invoice. Products are added from the search panel on
 * the right (a sheet on small screens); the line itself only edits MFD/EXP/qty/price
 * (the unit comes from the product).
 * Batches are NOT chosen here — the warehouse assigns them on a confirmed PI (CLAUDE.md §7.2).
 */
export function QuotationItemsEditor({
  control,
  register,
  setValue,
  getValues,
  errors,
  customerId,
  productById,
  onRememberProduct,
  documentLabel = "quotation",
}: {
  control: Control<QuotationCreateInput>;
  register: UseFormRegister<QuotationCreateInput>;
  setValue: UseFormSetValue<QuotationCreateInput>;
  getValues: UseFormGetValues<QuotationCreateInput>;
  errors: FieldErrors<QuotationCreateInput>;
  customerId: string;
  /** Names for the lines — the cached list plus anything picked from a server search. */
  productById: Map<string, ProductOption>;
  onRememberProduct: (product: ProductOption) => void;
  /** "quotation" or "proforma invoice" — used in messages. */
  documentLabel?: string;
}) {
  const queryClient = useQueryClient();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const [sheetOpen, setSheetOpen] = useState(false);
  // "Last quoted …" hint per product, valid for one customer only.
  const [hints, setHints] = useState<{ customerId: string; byProduct: Record<string, string> }>({ customerId, byProduct: {} });
  const priceHints = hints.customerId === customerId ? hints.byProduct : {};
  const scrollTo = useRef<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const products = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.list<Product>("/api/products", { pageSize: 200, sortBy: "brandName" }),
    staleTime: 60_000,
  });

  // Quantity per product for the panel's "Added" badge (at least 1 while a quantity is being retyped).
  const addedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items ?? []) {
      if (i?.productId) counts.set(i.productId, (counts.get(i.productId) ?? 0) + Math.max(Number(i.quantity) || 0, 1));
    }
    return counts;
  }, [items]);

  // Bring a just-added line into view inside the scrolling lines box (scroll-margin keeps it clear
  // of the sticky header/footer).
  useEffect(() => {
    if (scrollTo.current === null) return;
    rowRefs.current.get(scrollTo.current)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    scrollTo.current = null;
  });

  function pick(product: Product) {
    onRememberProduct(product);
    const current = getValues("items");
    // Already on the document → one more of it, not a second line. The price is already set.
    const existing = current.findIndex((i) => i.productId === product.id);
    if (existing !== -1) {
      const quantity = (Number(current[existing].quantity) || 0) + 1;
      setValue(`items.${existing}.quantity`, quantity, { shouldDirty: true, shouldValidate: true });
      scrollTo.current = existing;
      return;
    }
    // A line without a product (if any) is filled first; otherwise append.
    const blank = current.findIndex((i) => !i.productId);
    if (blank === -1 && current.length >= MAX_LINES) {
      toast.error(`A ${documentLabel} can have at most ${MAX_LINES} lines`);
      return;
    }
    const index = blank === -1 ? current.length : blank;
    if (blank === -1) {
      append({ ...emptyLine, productId: product.id, unit: product.unit ?? "" }, { shouldFocus: false });
    } else {
      setValue(`items.${index}.productId`, product.id, { shouldDirty: true, shouldValidate: true });
      setValue(`items.${index}.unit`, product.unit ?? "", { shouldDirty: true });
    }
    scrollTo.current = index;
    void loadLastPrice(index, product.id);
  }

  // CLAUDE.md §7.1: existing customer → auto-load last quoted price (from quotations OR PIs,
  // whichever is newer); new customer → stays 0.
  async function loadLastPrice(index: number, productId: string) {
    if (!customerId) return;
    const last = await queryClient.fetchQuery({
      queryKey: ["last-price", customerId, productId],
      queryFn: () => api.get<LastQuotedPrice | null>("/api/quotations/last-price", { customerId, productId }),
      staleTime: 60_000,
    });
    const hint = last
      ? `Last quoted ${formatUsd(last.price)} · ${last.documentNumber} · ${formatDate(last.date)}`
      : "No previous price for this customer";
    setHints((h) => ({
      customerId,
      byProduct: { ...(h.customerId === customerId ? h.byProduct : {}), [productId]: hint },
    }));
    // The line may have been removed/reordered or priced by hand while we waited.
    const line = getValues(`items.${index}`);
    if (last && line?.productId === productId && !Number(line.sellingPriceUsd)) {
      setValue(`items.${index}.sellingPriceUsd`, last.price, { shouldValidate: true });
    }
  }

  const itemErrors = errors.items;
  const total = (items ?? []).reduce(
    (s, i) => s + lineTotalCents(Number(i?.quantity) || 0, Number(i?.sellingPriceUsd) || 0),
    0,
  );

  const panelProps = {
    products: products.data?.data ?? [],
    totalCount: products.data?.totalCount ?? 0,
    loading: products.isLoading,
    addedCounts,
    onPick: pick,
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <span className="text-sm text-text-secondary">
            {fields.length} line{fields.length === 1 ? "" : "s"}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
            <PackagePlus />
            Browse products
          </Button>
        </div>

        {/* Long documents scroll inside this box (header and Sub Total stay pinned) so the wizard's
            step buttons below stay on screen. */}
        <div className="max-h-[60vh] overflow-auto scroll-smooth rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs text-text-secondary">
              <tr>
                <th className="w-8 px-2 py-2 text-left font-medium">#</th>
                <th className="px-2 py-2 text-left font-medium">Product</th>
                <th className="w-[104px] px-2 py-2 text-left font-medium">MFD</th>
                <th className="w-[104px] px-2 py-2 text-left font-medium">EXP</th>
                <th className="w-20 px-2 py-2 text-left font-medium">Qty</th>
                <th className="w-20 px-2 py-2 text-left font-medium">Unit</th>
                <th className="w-24 px-2 py-2 text-left font-medium">Price (USD)</th>
                <th className="w-24 px-2 py-2 text-right font-medium">Line total</th>
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-text-secondary">
                    <PackagePlus className="mx-auto mb-2 size-6 text-text-muted" />
                    No products yet. <span className="hidden lg:inline">Click a product in the list on the right to add it.</span>
                    <span className="lg:hidden">Use “Browse products” to add them.</span>
                  </td>
                </tr>
              )}
              {fields.map((field, index) => {
                const err = Array.isArray(itemErrors) ? itemErrors[index] : undefined;
                const line = items?.[index];
                const product = line?.productId ? productById.get(line.productId) : undefined;
                const lineCents = lineTotalCents(Number(line?.quantity) || 0, Number(line?.sellingPriceUsd) || 0);
                const hint = line?.productId ? priceHints[line.productId] : undefined;
                return (
                  <tr
                    key={field.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(index, el);
                      else rowRefs.current.delete(index);
                    }}
                    className="scroll-mt-10 scroll-mb-12 border-t align-top"
                  >
                    <td className="px-2 py-2.5 font-mono text-xs text-text-muted">{index + 1}</td>
                    <td className="px-2 py-2">
                      {line?.productId ? (
                        <div className="min-w-0 py-0.5">
                          <div className="font-medium">{product?.brandName ?? "Unknown product"}</div>
                          {product?.genericName && <div className="text-xs text-text-secondary">{product.genericName}</div>}
                          {hint && <div className="mt-0.5 text-[11px] leading-tight text-text-muted">{hint}</div>}
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed px-2 py-1.5 text-xs text-text-muted">
                          Pick a product from the list — it fills this line
                        </div>
                      )}
                      {err?.productId && <p className="mt-1 text-xs text-destructive">{err.productId.message}</p>}
                    </td>
                    <td className="px-2 py-2">
                      <Controller
                        control={control}
                        name={`items.${index}.mfd`}
                        render={({ field: f }) => (
                          <MonthYearInput id={`mfd-${index}`} value={f.value} onChange={f.onChange} onBlur={f.onBlur} invalid={!!err?.mfd} />
                        )}
                      />
                      {err?.mfd && <p className="mt-1 text-xs text-destructive">{err.mfd.message}</p>}
                    </td>
                    <td className="px-2 py-2">
                      <Controller
                        control={control}
                        name={`items.${index}.exp`}
                        render={({ field: f }) => (
                          <MonthYearInput id={`exp-${index}`} value={f.value} onChange={f.onChange} onBlur={f.onBlur} invalid={!!err?.exp} />
                        )}
                      />
                      {err?.exp && <p className="mt-1 text-xs text-destructive">{err.exp.message}</p>}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="font-mono"
                        aria-label={`Quantity, line ${index + 1}`}
                        aria-invalid={!!err?.quantity || undefined}
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                      />
                      {err?.quantity && <p className="mt-1 text-xs text-destructive">{err.quantity.message}</p>}
                    </td>
                    <td className="px-2 py-2">
                      {/* Filled from the product's master data when it's picked — not editable here. */}
                      <Input
                        readOnly
                        tabIndex={-1}
                        placeholder="—"
                        title="Set on the product"
                        className="cursor-not-allowed bg-muted"
                        aria-label={`Unit, line ${index + 1}`}
                        {...register(`items.${index}.unit`)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="font-mono"
                        aria-label={`Price in USD, line ${index + 1}`}
                        aria-invalid={!!err?.sellingPriceUsd || undefined}
                        {...register(`items.${index}.sellingPriceUsd`, { valueAsNumber: true })}
                      />
                      {err?.sellingPriceUsd && <p className="mt-1 text-xs text-destructive">{err.sellingPriceUsd.message}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">{formatUsd(lineCents / 100)}</td>
                    <td className="px-1 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-muted">
              <tr className="border-t">
                <td colSpan={7} className="px-2 py-2 text-right text-sm font-medium">
                  Sub Total
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold">{formatUsd(total / 100)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {!Array.isArray(itemErrors) && itemErrors?.message && <p className="text-sm text-destructive">{itemErrors.message}</p>}
      </div>

      {/* The aside spans the table's height, so the panel sticks while a long table scrolls but never
          makes a short one taller than it is (which would push the search box under the topbar). */}
      <aside className="hidden min-h-[480px] self-stretch lg:block">
        <ProductPickerPanel {...panelProps} className="sticky top-20 h-full max-h-[calc(100vh-11rem)]" />
      </aside>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[320px] gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Add products</SheetTitle>
            <SheetDescription>Each click adds a line to the {documentLabel}.</SheetDescription>
          </SheetHeader>
          <ProductPickerPanel {...panelProps} className="flex-1 rounded-none border-0 shadow-none" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
