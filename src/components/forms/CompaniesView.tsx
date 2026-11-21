"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { CompanyFormSheet } from "@/components/forms/CompanyFormSheet";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import type { CompanyDetail } from "@/types/entities";

export function CompaniesView() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyDetail | null>(null);
  const query = useQuery({
    queryKey: ["companies", "full"],
    queryFn: () => api.get<CompanyDetail[]>("/api/companies", { full: 1 }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Each company has its own customers, suppliers, quotations and invoices. Products and stock are shared."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setSheetOpen(true);
            }}
          >
            <Plus />
            New company
          </Button>
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : !query.data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex gap-4">
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded bg-paper ring-1 ring-border">
                  {c.logoPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                    <img src={c.logoPreviewUrl} alt="" className="max-h-16 max-w-16 object-contain" />
                  ) : (
                    <Building2 className="size-6 text-text-muted" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold">{c.name}</h2>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${c.name}`}
                      onClick={() => {
                        setEditing(c);
                        setSheetOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </div>
                  <div className="mt-1 space-y-0.5 text-[13px] text-text-secondary">
                    {c.address && <p className="whitespace-pre-line">{c.address}</p>}
                    {(c.phone || c.email) && <p>{[c.phone, c.email].filter(Boolean).join(" · ")}</p>}
                    {c.website && <p>{c.website}</p>}
                    <p>
                      {c.taxId ? `Tax ID ${c.taxId} · ` : ""}
                      {c.currency}
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-text-muted">
                    {c.userCount} user{c.userCount === 1 ? "" : "s"} · {c.customerCount} customer{c.customerCount === 1 ? "" : "s"} ·{" "}
                    {c.orderCount} quotation{c.orderCount === 1 ? "" : "s"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <CompanyFormSheet open={sheetOpen} onOpenChange={setSheetOpen} company={editing} />
    </div>
  );
}
