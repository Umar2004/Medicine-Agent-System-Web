"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ProformaWizard } from "@/components/forms/ProformaWizard";
import { ErrorState } from "@/components/shared/ErrorState";
import { ORDER_STATUS_LABELS } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-company";
import { api } from "@/lib/api-client";
import type { OrderDetail, OrderStatus } from "@/types/entities";

/** Mirrors ORDER_EDITABLE_STATUSES on the server. */
const EDITABLE: OrderStatus[] = ["draft", "sent", "negotiating", "confirmed"];

export function OrderEdit({ id }: { id: string }) {
  const { companyId } = useCompany();
  const query = useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: () => api.get<OrderDetail>(`/api/orders/${id}`),
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} />;

  const o = query.data;
  const blocked = !EDITABLE.includes(o.status)
    ? `This proforma invoice is ${ORDER_STATUS_LABELS[o.status].toLowerCase()} and can no longer be edited.`
    : companyId !== o.companyId
      ? `Switch to ${o.companyName} in the top bar to edit this proforma invoice.`
      : null;

  if (blocked) {
    return (
      <div className="space-y-4 rounded-lg border bg-card p-8 text-center text-sm text-text-secondary">
        <p>{blocked}</p>
        <Button variant="outline" asChild>
          <Link href={`/orders/${id}`}>Back to {o.orderNumber}</Link>
        </Button>
      </div>
    );
  }
  // key: remount the form if a refetch brings a newer version.
  return <ProformaWizard key={o.updatedAt} order={o} />;
}
