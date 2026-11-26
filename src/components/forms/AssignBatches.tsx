"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AssignmentSummaryBar } from "@/components/batch-assignment/AssignmentSummaryBar";
import { BatchAssignmentPanel } from "@/components/batch-assignment/BatchAssignmentPanel";
import { ProductList } from "@/components/batch-assignment/ProductList";
import { ProgressBar } from "@/components/batch-assignment/ProgressBar";
import {
  assignedQty,
  autoFillLine,
  lineStatus,
  type Allocation,
  type LineStatus,
} from "@/components/batch-assignment/allocation";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-company";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { Batch, LowStockWarning, OrderDetail, OrderItemDetail, ValidBatches } from "@/types/entities";

/**
 * Batch assignment for a confirmed PI (CLAUDE.md §7.8) — master-detail: product list on the left,
 * the selected product's batches on the right. Saving needs every line assigned exactly its quantity.
 */
export function AssignBatches({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const order = useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: () => api.get<OrderDetail>(`/api/orders/${id}`),
  });
  // Editing an existing assignment: start from it, and treat the stock it holds as available again.
  const editing = order.data?.status === "batch_assigned";
  const { lines, initialAlloc, committed } = useMemo(() => planFromOrder(order.data), [order.data]);
  // null = untouched → show the current assignment (editing) or nothing (first assignment).
  const [touchedAlloc, setTouchedAlloc] = useState<Allocation | null>(null);
  const alloc = touchedAlloc ?? initialAlloc;
  const setAlloc = (update: (a: Allocation) => Allocation) => setTouchedAlloc((a) => update(a ?? initialAlloc));
  const productIds = useMemo(() => [...new Set(lines.map((l) => l.productId))], [lines]);

  // Prefetch every product's valid batches up front (instant switching on long PIs).
  const batchQueries = useQueries({
    queries: productIds.map((pid) => ({
      queryKey: ["batches", "valid", pid],
      queryFn: () => api.get<ValidBatches>(`/api/products/${pid}/valid-batches`),
    })),
  });
  const valid = useMemo(() => {
    const map = new Map<string, ValidBatches>();
    batchQueries.forEach((q, i) => q.data && map.set(productIds[i], withCommittedStock(q.data, committed.get(productIds[i]))));
    return map;
  }, [batchQueries, productIds, committed]);
  const batchesOf = (productId: string): Batch[] | undefined => valid.get(productId)?.batches;
  const allLoaded = productIds.every((pid) => valid.has(pid));

  const statuses = useMemo(() => {
    const s: Record<string, LineStatus> = {};
    for (const l of lines) s[l.id] = lineStatus(alloc, l, valid.get(l.productId)?.batches);
    return s;
  }, [alloc, lines, valid]);
  const assigned = useMemo(() => Object.fromEntries(lines.map((l) => [l.id, assignedQty(alloc, l.id)])), [alloc, lines]);
  const counts = useMemo(() => {
    const c = { done: 0, partial: 0, pending: 0 };
    for (const l of lines) c[statuses[l.id]]++;
    return c;
  }, [lines, statuses]);

  const assign = useMutation({
    mutationFn: () =>
      api.post<OrderDetail & { lowStock: LowStockWarning[] }>(`/api/orders/${id}/assign-batches`, {
        allocations: lines.map((l) => ({
          orderItemId: l.id,
          batches: Object.entries(alloc[l.id] ?? {})
            .filter(([, quantity]) => quantity > 0)
            .map(([batchId, quantity]) => ({ batchId, quantity })),
        })),
      }),
    onSuccess: () => {
      toast.success(editing ? "Batch assignment updated — stock adjusted" : "Batches assigned successfully");
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["quotations"] });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      router.push(`/orders/${id}`);
    },
    onError: (err) => showError(errorMessage(err), "Could not assign batches"),
  });

  /** Saves straight away (no confirmation) — only once every line has exactly its quantity. */
  function save() {
    if (assign.isPending || lines.some((l) => statuses[l.id] !== "done")) return;
    assign.mutate();
  }

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href={`/orders/${id}`}>
        <ArrowLeft />
        {order.data?.orderNumber ?? "Proforma invoice"}
      </Link>
    </Button>
  );

  if (order.isLoading) return <Skeleton className="h-96 w-full" />;
  if (order.isError || !order.data) return <ErrorState error={order.error} />;
  const o = order.data;

  if (o.status !== "confirmed" && o.status !== "batch_assigned") {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-text-secondary">
          Batches can only be assigned once the customer has confirmed the proforma invoice. This one is {o.status.replace("_", " ")}.
        </div>
      </div>
    );
  }
  if (companyId !== o.companyId) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-text-secondary">
          Switch to {o.companyName} in the top bar to assign batches.
        </div>
      </div>
    );
  }

  const index = Math.max(0, lines.findIndex((l) => l.id === selectedId));
  const line = lines[index];
  const isLast = index === lines.length - 1;
  const allDone = counts.done === lines.length;
  const currentDone = line ? statuses[line.id] === "done" : false;
  const firstUnfinished = lines.find((l) => statuses[l.id] !== "done");

  function next() {
    if (!currentDone) return;
    if (!isLast) setSelectedId(lines[index + 1].id);
    else if (allDone) save();
    else if (firstUnfinished) setSelectedId(firstUnfinished.id);
  }

  return (
    <div className="space-y-4">
      <div>
        {back}
        <PageHeader
          title={`${editing ? "Edit batches" : "Assign batches"} — ${o.orderNumber}`}
          description={
            editing
              ? "Change the batches below and save. The previous assignment's stock is put back and the new batches are deducted in one step."
              : `${o.customer.businessName || o.customer.name} · ${lines.length} product${lines.length === 1 ? "" : "s"} · Created ${formatDate(o.createdAt)}`
          }
          action={
            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-primary"
                disabled={!allLoaded || allDone}
                onClick={() =>
                  setAlloc((a) => lines.reduce((acc, l) => autoFillLine(acc, l, batchesOf(l.productId) ?? []), a))
                }
              >
                <Sparkles />
                Auto-fill all
              </Button>
              <div className="w-44 space-y-1.5">
                <div className="text-right text-sm">
                  <span className="font-mono font-medium">
                    {counts.done} / {lines.length}
                  </span>{" "}
                  <span className="text-text-secondary">assigned</span>
                </div>
                <ProgressBar value={counts.done} max={lines.length} label="Products fully assigned" />
              </div>
            </div>
          }
        />
      </div>

      {line && (
        <div className="grid gap-4 lg:h-[calc(100dvh-19rem)] lg:min-h-[520px] lg:grid-cols-[340px_minmax(0,1fr)]">
          <ProductList lines={lines} statuses={statuses} assigned={assigned} selectedId={line.id} onSelect={setSelectedId} />
          <BatchAssignmentPanel
            line={line}
            batches={batchesOf(line.productId)}
            alloc={alloc}
            onQuantityChange={(batchId, qty) =>
              setAlloc((a) => {
                const parts = { ...(a[line.id] ?? {}) };
                if (qty > 0) parts[batchId] = qty;
                else delete parts[batchId];
                return { ...a, [line.id]: parts };
              })
            }
            onAutoFill={() => setAlloc((a) => autoFillLine(a, line, batchesOf(line.productId) ?? []))}
            position={index + 1}
            total={lines.length}
            onPrevious={index > 0 ? () => setSelectedId(lines[index - 1].id) : null}
            onNext={next}
            nextLabel={isLast ? (allDone ? "Save all assignments" : "Next unfinished") : "Next"}
            nextDisabled={!currentDone || assign.isPending}
            nextHint={`Assign exactly ${line.quantity.toLocaleString()} to continue`}
          />
        </div>
      )}

      <AssignmentSummaryBar
        done={counts.done}
        partial={counts.partial}
        pending={counts.pending}
        total={lines.length}
        saving={assign.isPending}
        onSave={save}
      />
    </div>
  );
}

/** batchId → quantity this PI currently holds, per product. */
type Held = Map<string, { quantity: number; item: OrderItemDetail }>;
type Committed = Map<string, Held>;

/**
 * PI lines for the page. A batch-assigned PI has one row per batch; those rows are merged back into one line per
 * sort_order (the server maps any row id of a line to the same line), and the current split becomes the
 * starting allocation.
 */
function planFromOrder(o: OrderDetail | undefined): { lines: OrderItemDetail[]; initialAlloc: Allocation; committed: Committed } {
  const sorted = [...(o?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  if (o?.status !== "batch_assigned") return { lines: sorted, initialAlloc: {}, committed: new Map() };

  const bySort = new Map<number, OrderItemDetail>();
  const initialAlloc: Allocation = {};
  const committed: Committed = new Map();
  for (const item of sorted) {
    let line = bySort.get(item.sortOrder);
    if (line) {
      line.quantity += item.quantity;
      line.totalUsd += item.totalUsd;
    } else {
      line = { ...item, batchId: null, batchNumber: null, batchMfd: null, batchExp: null };
      bySort.set(item.sortOrder, line);
    }
    if (!item.batchId) continue;
    const parts = (initialAlloc[line.id] ??= {});
    parts[item.batchId] = (parts[item.batchId] ?? 0) + item.quantity;
    const forProduct: Held = committed.get(item.productId) ?? new Map();
    const held = forProduct.get(item.batchId);
    forProduct.set(item.batchId, { quantity: (held?.quantity ?? 0) + item.quantity, item });
    committed.set(item.productId, forProduct);
  }
  return { lines: [...bySort.values()], initialAlloc, committed };
}

/**
 * Stock as it will be once this PI's current assignment is released: what it holds is added back, and a batch it
 * emptied (so no longer listed as valid) is shown again. The server re-checks everything on save.
 */
function withCommittedStock(data: ValidBatches, held: Held | undefined): ValidBatches {
  if (!held?.size) return data;
  const batches: Batch[] = data.batches.map((b) => {
    const h = held.get(b.id);
    return h ? { ...b, stockQuantity: b.stockQuantity + h.quantity } : b;
  });
  for (const [batchId, { quantity, item }] of held) {
    if (batches.some((b) => b.id === batchId)) continue;
    batches.push({
      id: batchId,
      batchNumber: item.batchNumber ?? "—",
      productId: item.productId,
      productNumber: item.productNumber,
      productName: item.brandName,
      productUnit: item.unit,
      supplierId: null,
      supplierName: null,
      supplierCompanyName: null,
      mfd: item.batchMfd,
      exp: item.batchExp,
      stockQuantity: quantity,
      costPrice: null,
      priceType: null,
      isActive: true,
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
  }
  return { ...data, batches };
}
