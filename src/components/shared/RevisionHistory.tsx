"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, History, Loader2 } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/shared/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { formatDateTime, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RevisionDocumentType } from "@/lib/constants";
import type { RevisionSummary } from "@/types/entities";

/** Shape of `document_revisions.snapshot` — the stored rows at that revision. */
interface RevisionSnapshot {
  document: { status: string; totalCnf: string; showFreight?: boolean; airFreight?: string; handlingDocumentation?: string };
  items: { id: string; productId: string; quantity: number; unit: string | null; sellingPriceUsd: string | null; totalUsd: string | null }[];
}

interface RevisionDetail extends RevisionSummary {
  snapshot: RevisionSnapshot;
  productNames: Record<string, string>;
}

/** Collapsible version history for a quotation or PI. Each revision expands to show its lines and totals as they were. */
export function RevisionHistory({ documentType, documentId }: { documentType: RevisionDocumentType; documentId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["revisions", documentType, documentId],
    queryFn: () => api.get<RevisionSummary[]>("/api/revisions", { documentType, documentId }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-text-muted" />
          Revision history
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {list.isLoading && <Loader2 className="size-4 animate-spin text-text-muted" />}
        {list.isError && <ErrorState error={list.error} />}
        {list.data?.length === 0 && <p className="text-text-secondary">No revisions recorded.</p>}
        {list.data && list.data.length > 0 && (
          <ol className="divide-y rounded-lg border">
            {list.data.map((r, i) => {
              const expanded = open === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : r.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                  >
                    <ChevronRight
                      className={cn("mt-0.5 size-4 shrink-0 text-text-muted transition-transform", expanded && "rotate-90")}
                    />
                    <span className="w-12 shrink-0 font-mono text-xs font-medium">Rev {r.revisionNumber}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{r.changeSummary ?? "—"}</span>
                      <span className="block text-xs text-text-muted">
                        {formatDateTime(r.createdAt)}
                        {r.createdByName && ` · ${r.createdByName}`}
                        {i === 0 && " · current"}
                      </span>
                    </span>
                  </button>
                  {expanded && <RevisionLines id={r.id} />}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function RevisionLines({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ["revisions", "detail", id],
    queryFn: () => api.get<RevisionDetail>(`/api/revisions/${id}`),
    staleTime: Infinity, // snapshots never change
  });

  if (detail.isLoading) {
    return (
      <div className="px-10 pb-3">
        <Loader2 className="size-4 animate-spin text-text-muted" />
      </div>
    );
  }
  if (detail.isError || !detail.data) return <div className="px-10 pb-3"><ErrorState error={detail.error} /></div>;

  const { snapshot, productNames } = detail.data;
  const { document, items } = snapshot;
  return (
    <div className="overflow-x-auto px-10 pb-3">
      <table className="w-full min-w-[480px] text-xs">
        <thead className="text-text-secondary">
          <tr>
            <th className="py-1 pr-3 text-left font-medium">Product</th>
            <th className="py-1 pr-3 text-right font-medium">Qty</th>
            <th className="py-1 pr-3 text-right font-medium">Unit price</th>
            <th className="py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t">
              <td className="py-1 pr-3">{productNames[it.productId] ?? "Unknown product"}</td>
              <td className="py-1 pr-3 text-right font-mono">
                {it.quantity.toLocaleString()} {it.unit}
              </td>
              <td className="py-1 pr-3 text-right font-mono">{formatUsd(it.sellingPriceUsd)}</td>
              <td className="py-1 text-right font-mono">{formatUsd(it.totalUsd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium">
            <td colSpan={3} className="py-1 pr-3 text-right">
              {document.showFreight === false ? "Total" : "Total C&F"} · status {document.status.replace("_", " ")}
            </td>
            <td className="py-1 text-right font-mono">{formatUsd(document.totalCnf)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
