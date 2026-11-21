"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { QuotationWizard } from "@/components/forms/QuotationWizard";
import { ErrorState } from "@/components/shared/ErrorState";
import { QUOTATION_STATUS_LABELS } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-company";
import { api } from "@/lib/api-client";
import type { QuotationDetail, QuotationStatus } from "@/types/entities";

/** Mirrors QUOTATION_EDITABLE_STATUSES on the server. */
const EDITABLE: QuotationStatus[] = ["draft", "sent", "negotiating", "rejected", "accepted"];

export function QuotationEdit({ id }: { id: string }) {
  const { companyId } = useCompany();
  const query = useQuery({
    queryKey: ["quotations", "detail", id],
    queryFn: () => api.get<QuotationDetail>(`/api/quotations/${id}`),
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} />;

  const q = query.data;
  const blocked = !EDITABLE.includes(q.status)
    ? `This quotation is ${QUOTATION_STATUS_LABELS[q.status].toLowerCase()} and can no longer be edited.`
    : companyId !== q.companyId
      ? `Switch to ${q.companyName} in the top bar to edit this quotation.`
      : null;

  if (blocked) {
    return (
      <div className="space-y-4 rounded-lg border bg-card p-8 text-center text-sm text-text-secondary">
        <p>{blocked}</p>
        <Button variant="outline" asChild>
          <Link href={`/quotations/${id}`}>Back to {q.quotationNumber}</Link>
        </Button>
      </div>
    );
  }
  // key: remount the form if a refetch brings a newer version.
  return <QuotationWizard key={q.updatedAt} quotation={q} />;
}
