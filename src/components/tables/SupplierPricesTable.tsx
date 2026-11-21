"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerTable } from "@/hooks/use-server-table";
import { api } from "@/lib/api-client";
import { formatDate, formatDateTime, formatLkr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SupplierPriceComparison, SupplierPriceRecord, SupplierPriceSummary } from "@/types/entities";

const muted = <span className="text-text-muted">—</span>;

const typeLabel = (t: string | null) => (t === "wholesale" ? "Wholesale" : t === "retail" ? "Retail" : "Unspecified");

const price = (v: number | null) => (v === null ? muted : <span className="font-mono">{formatLkr(v)}</span>);

/** A trend the reader can't misread in print or without colour: arrow + signed percentage. */
function Change({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null || previous === 0 || previous === current) return muted;
  const pct = ((current - previous) / previous) * 100;
  const up = pct > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono text-xs", up ? "text-destructive" : "text-success-text")}>
      <Icon className="size-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function PriceDetail({ product, companyKey }: { product: SupplierPriceSummary; companyKey: string | null }) {
  const compare = useQuery({
    queryKey: ["supplier-prices", companyKey, product.productId, "best"],
    queryFn: () =>
      api.get<{ comparison: SupplierPriceComparison[] }>(`/api/products/${product.productId}/best-supplier-price`),
  });
  const history = useQuery({
    queryKey: ["supplier-prices", companyKey, product.productId, "history"],
    queryFn: () => api.list<SupplierPriceRecord>(`/api/products/${product.productId}/supplier-history`, { pageSize: 100 }),
  });

  const rows = compare.data?.comparison ?? [];
  const types = [...new Set(rows.map((r) => r.priceType))];

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Current price by supplier</h3>
        {compare.isError ? (
          <ErrorState error={compare.error} />
        ) : compare.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-4">
            {types.map((type) => (
              <div key={type ?? "none"} className="overflow-hidden rounded-lg border">
                <div className="bg-muted px-3 py-1.5 text-xs font-medium text-text-secondary">{typeLabel(type)}</div>
                <table className="w-full text-[13px]">
                  <tbody>
                    {rows
                      .filter((r) => r.priceType === type)
                      .map((r) => (
                        <tr key={r.supplierId} className={cn("border-t", r.isBest && "bg-primary-light/40")}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 font-medium">
                              {r.supplierName}
                              {r.isBest && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                                  <Trophy className="size-3" />
                                  Lowest
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-text-muted">
                              {formatDate(r.recordedAt)} · {r.records} record{r.records === 1 ? "" : "s"}
                            </div>
                          </td>
                          <td className="w-20 px-2 py-2 text-right">
                            <Change current={r.priceLkr} previous={r.previousPriceLkr} />
                          </td>
                          <td className="w-36 px-3 py-2 text-right font-mono font-medium whitespace-nowrap">{formatLkr(r.priceLkr)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
            {rows.length === 0 && <p className="text-sm text-text-secondary">No current prices.</p>}
            {rows.length > 0 && <p className="text-xs text-text-muted">The arrow shows the change since that supplier&apos;s previous price.</p>}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Price history{history.data ? ` (${history.data.totalCount})` : ""}
        </h3>
        {history.isError ? (
          <ErrorState error={history.error} />
        ) : history.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-[13px]">
              <thead className="bg-muted text-xs text-text-secondary">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Date</th>
                  <th className="px-3 py-1.5 text-left font-medium">Supplier</th>
                  <th className="px-3 py-1.5 text-left font-medium">Type</th>
                  <th className="px-3 py-1.5 text-right font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {(history.data?.data ?? []).map((h) => (
                  <tr key={h.id} className="border-t align-top">
                    <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">{formatDateTime(h.recordedAt)}</td>
                    <td className="px-3 py-1.5">
                      {h.supplierName}
                      {h.supplierDeleted && <span className="ml-1 text-xs text-text-muted">(deleted)</span>}
                      {h.notes && <div className="text-xs text-text-muted">{h.notes}</div>}
                    </td>
                    <td className="px-3 py-1.5 text-text-secondary">{typeLabel(h.priceType)}</td>
                    <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">{formatLkr(h.priceLkr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Supplier cost comparison (LKR): access is manage_suppliers or view_reports (CLAUDE.md §6). */
export function SupplierPricesTable() {
  const { can } = usePermissions();
  const { companyId } = useCompany();
  const allowed = can("manage_suppliers") || can("view_reports");
  const { params, search, setSearch, tableProps } = useServerTable({ id: "brandName" });
  const [selected, setSelected] = useState<SupplierPriceSummary | null>(null);

  const query = useQuery({
    queryKey: ["supplier-prices", companyId, params],
    queryFn: () => api.list<SupplierPriceSummary>("/api/supplier-price-history", params),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });

  // Imported prices often have no wholesale/retail type; only then is this column worth its space.
  const showUntyped = query.data?.data.some((r) => r.bestOther !== null) ?? false;

  const columns = useMemo<ColumnDef<SupplierPriceSummary, unknown>[]>(
    () => [
      {
        id: "brandName",
        header: "Product",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.brandName}</div>
            <div className="text-xs text-text-muted">
              {[row.original.genericName, row.original.unit, row.original.manufacturerName].filter(Boolean).join(" · ")}
            </div>
          </div>
        ),
      },
      { id: "supplierCount", header: "Suppliers", enableSorting: false, cell: ({ row }) => <span className="font-mono">{row.original.supplierCount}</span> },
      { id: "bestWholesale", header: "Lowest wholesale", enableSorting: false, cell: ({ row }) => price(row.original.bestWholesale) },
      { id: "bestRetail", header: "Lowest retail", enableSorting: false, cell: ({ row }) => price(row.original.bestRetail) },
      ...(showUntyped
        ? [{ id: "bestOther", header: "Lowest (type not set)", enableSorting: false, cell: ({ row }) => price(row.original.bestOther) } satisfies ColumnDef<SupplierPriceSummary, unknown>]
        : []),
      { id: "lastRecordedAt", header: "Last recorded", enableSorting: false, cell: ({ row }) => <span className="text-xs">{formatDate(row.original.lastRecordedAt)}</span> },
    ],
    [showUntyped],
  );

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Supplier prices" />
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-text-secondary">
          You need the “Manage suppliers” or “View reports” permission to compare supplier prices.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier prices"
        description="What suppliers charge for each product, in LKR. Prices are recorded automatically from batches. Click a product to compare."
      />
      <SearchInput onSearch={setSearch} placeholder="Search product name, generic or number…" />
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          totalCount={query.data?.totalCount ?? 0}
          isLoading={query.isLoading}
          emptyMessage={search ? `No prices match “${search}”.` : "No supplier prices yet. They appear when a batch is saved with a supplier and cost price."}
          getRowId={(r) => r.productId}
          onRowClick={setSelected}
          {...tableProps}
        />
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full gap-0 sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{selected.brandName}</SheetTitle>
                <SheetDescription>
                  {[selected.productNumber, selected.genericName, selected.unit].filter(Boolean).join(" · ")}
                </SheetDescription>
              </SheetHeader>
              <PriceDetail product={selected} companyKey={companyId} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
