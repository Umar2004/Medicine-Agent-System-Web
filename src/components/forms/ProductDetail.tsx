"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ProductFormSheet } from "@/components/forms/ProductFormSheet";
import { BatchesTable } from "@/components/tables/BatchesTable";
import { StockBadge } from "@/components/shared/StockBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import type { Product } from "@/types/entities";

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
      <dd className={mono ? "mt-1 font-mono text-sm" : "mt-1 text-sm"}>
        {value ?? <span className="text-text-muted">—</span>}
      </dd>
    </div>
  );
}

export function ProductDetail({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("manage_products");
  const [editOpen, setEditOpen] = useState(false);

  const query = useQuery({
    queryKey: ["products", "detail", id],
    queryFn: () => api.get<Product>(`/api/products/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api.del<{ id: string }>(`/api/products/${id}`),
    onSuccess: () => {
      toast.success("Product deleted");
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      router.push("/products");
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete product"),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href="/products">
        <ArrowLeft />
        Products
      </Link>
    </Button>
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-destructive">
          {errorMessage(query.error)}
        </div>
      </div>
    );
  }

  const p = query.data;

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-text-secondary">{p.productNumber}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{p.brandName}</h1>
          {p.genericName && <p className="mt-1 text-sm text-muted-foreground">{p.genericName}</p>}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                const ok = await confirmDanger({
                  title: `Delete ${p.brandName}?`,
                  text: "Products that still have batches cannot be deleted.",
                });
                if (ok) remove.mutate();
              }}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
              <Detail label="Brand name" value={p.brandName} />
              <Detail label="Generic name" value={p.genericName} />
              <Detail label="Manufacturer" value={p.manufacturerName} />
              <Detail label="Unit" value={p.unit} />
              <Detail label="Country of origin" value={p.country} />
              <Detail label="Created" value={new Date(p.createdAt).toLocaleDateString()} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <Detail
                label="Total stock (all batches)"
                value={
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-lg">{p.totalStock.toLocaleString()}</span>
                    <StockBadge totalStock={p.totalStock} threshold={p.lowStockThreshold} />
                  </span>
                }
              />
              <Detail label="Low stock threshold" value={p.lowStockThreshold.toLocaleString()} mono />
              <Detail label="Batches" value={p.batchCount.toLocaleString()} mono />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batches</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchesTable productId={p.id} />
        </CardContent>
      </Card>

      <ProductFormSheet open={editOpen} onOpenChange={setEditOpen} product={p} />
    </div>
  );
}
