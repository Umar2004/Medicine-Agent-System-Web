"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileText,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EChart, formatValue } from "@/components/charts/EChart";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { OrderStatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api-client";
import { formatDate, formatUsd, monYY } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/entities";

interface DashboardData {
  scope: string;
  kpis: {
    todayQuotations: number;
    /** PIs sent to / negotiating with the customer. */
    awaitingConfirmation: number;
    awaitingBatches: number;
    readyToInvoice: number;
    lowStock: number;
    nearExpiry: number;
    expiredWithStock: number;
  };
  sales: {
    monthTotal: number;
    previousMonthTotal: number;
    monthInvoices: number;
    trend: { month: string; total: number }[];
    topProducts: {
      productId: string;
      brandName: string;
      quantity: number;
      value: number;
    }[];
  } | null;
  stockLevels: {
    productId: string;
    brandName: string;
    stock: number;
    threshold: number;
  }[];
  nearExpiry: {
    batchId: string;
    productId: string;
    batchNumber: string;
    brandName: string;
    exp: string;
    stock: number;
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    total: number;
    customer: string;
    createdAt: string;
  }[];
}

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

function StatTile({
  label,
  value,
  icon: Icon,
  href,
  tone = "default",
  note,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "warning" | "danger";
  note?: React.ReactNode;
}) {
  const body = (
    <Card className={cn("h-full gap-1 py-4 transition-colors", href && "hover:border-primary/40")}>
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div>
          <div className="text-xs font-medium text-text-secondary">{label}</div>
          <div className="mt-1 font-mono text-2xl font-semibold tracking-tight">{value}</div>
          {note && <div className="mt-1 text-xs text-text-secondary">{note}</div>}
        </div>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone === "default" && "bg-primary-light text-primary",
            tone === "warning" && "bg-warning/15 text-warning-text",
            tone === "danger" && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="size-4.5" />
        </div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function DashboardView() {
  const { data: session } = useSession();
  const { companyId, isAllCompanies, currentCompany } = useCompany();
  const { canSee } = usePermissions();
  const isAdmin = session?.user.role === "admin";
  const [allMine, setAllMine] = useState(false);

  const query = useQuery({
    queryKey: ["dashboard", companyId, allMine],
    queryFn: () => api.get<DashboardData>("/api/dashboard", isAdmin && allMine ? { scope: "all" } : undefined),
    refetchInterval: 5 * 60_000,
  });

  const d = query.data;
  const firstName = session?.user.fullName.split(" ")[0];
  const scopeLabel = d?.scope ?? (isAllCompanies ? "All companies" : (currentCompany?.name ?? ""));

  const delta =
    d?.sales && d.sales.previousMonthTotal > 0
      ? ((d.sales.monthTotal - d.sales.previousMonthTotal) / d.sales.previousMonthTotal) * 100
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : "Dashboard"}
        description={`Viewing ${scopeLabel}. Stock figures cover the shared warehouse.`}
        action={
          isAdmin && (
            <div className="flex items-center gap-2">
              <Switch id="dash-all" checked={allMine} onCheckedChange={setAllMine} />
              <Label htmlFor="dash-all" className="text-sm">
                All my companies
              </Label>
            </div>
          )
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} />
      ) : !d ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {d.sales && (
              <StatTile
                label="Sales this month"
                value={formatUsd(d.sales.monthTotal)}
                icon={delta !== null && delta < 0 ? TrendingDown : TrendingUp}
                href={canSee("/invoices") ? "/invoices" : undefined}
                note={
                  <>
                    {d.sales.monthInvoices} invoice
                    {d.sales.monthInvoices === 1 ? "" : "s"}
                    {delta !== null && ` · ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs last month`}
                  </>
                }
              />
            )}
            <StatTile
              label="Quotations today"
              value={String(d.kpis.todayQuotations)}
              icon={FilePlus2}
              href={canSee("/quotations") ? "/quotations" : undefined}
            />
            <StatTile
              label="PIs awaiting confirmation"
              value={String(d.kpis.awaitingConfirmation)}
              icon={Clock}
              tone={d.kpis.awaitingConfirmation > 0 ? "warning" : "default"}
              href={canSee("/orders") ? "/orders" : undefined}
            />
            <StatTile
              label="Awaiting batches"
              value={String(d.kpis.awaitingBatches)}
              icon={Boxes}
              href={canSee("/orders") ? "/orders" : undefined}
              note={`${d.kpis.readyToInvoice} ready to invoice`}
            />
            <StatTile
              label="Low stock products"
              value={String(d.kpis.lowStock)}
              icon={AlertTriangle}
              tone={d.kpis.lowStock > 0 ? "warning" : "default"}
              href={canSee("/products") ? "/products" : undefined}
            />
            <StatTile
              label="Batches near expiry"
              value={String(d.kpis.nearExpiry)}
              icon={CalendarClock}
              tone={d.kpis.expiredWithStock > 0 ? "danger" : d.kpis.nearExpiry > 0 ? "warning" : "default"}
              href={canSee("/batches") ? "/batches" : undefined}
              note={d.kpis.expiredWithStock > 0 ? `${d.kpis.expiredWithStock} expired with stock` : "within 6 months"}
            />
          </div>

          {d.sales && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Sales — last 12 months</CardTitle>
                  <p className="text-xs text-text-muted">Invoice C&amp;F totals, cancelled invoices excluded</p>
                </CardHeader>
                <CardContent>
                  <EChart
                    kind="line"
                    categories={d.sales.trend.map((t) => monthLabel(t.month))}
                    series={[
                      {
                        name: "Sales (USD)",
                        kind: "usd",
                        data: d.sales.trend.map((t) => t.total),
                      },
                    ]}
                    ariaLabel="Monthly sales for the last 12 months"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top products</CardTitle>
                  <p className="text-xs text-text-muted">By invoiced value, last 90 days</p>
                </CardHeader>
                <CardContent>
                  {d.sales.topProducts.length === 0 ? (
                    <p className="py-10 text-center text-sm text-text-secondary">
                      No invoiced sales in the last 90 days.
                    </p>
                  ) : (
                    <ol className="space-y-3">
                      {d.sales.topProducts.map((p, i) => {
                        const max = d.sales!.topProducts[0].value || 1;
                        return (
                          <li key={p.productId}>
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                              <Link
                                href={`/products/${p.productId}`}
                                className="truncate font-medium hover:text-primary"
                              >
                                <span className="mr-2 font-mono text-xs text-text-muted">{i + 1}</span>
                                {p.brandName}
                              </Link>
                              <span className="font-mono text-xs text-text-secondary">{formatUsd(p.value)}</span>
                            </div>
                            <progress
                              value={p.value}
                              max={max}
                              aria-label={`${p.brandName} share of top product sales`}
                              className="mt-1 block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-series-1 [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-series-1"
                            />
                            <div className="mt-0.5 text-xs text-text-muted">
                              {formatValue(p.quantity, "number")} units
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Stock near the low-stock threshold</CardTitle>
                <p className="text-xs text-text-muted">
                  Products with stock up to 3× their threshold; dashed line = each product&apos;s threshold
                </p>
              </CardHeader>
              <CardContent>
                {d.stockLevels.length === 0 ? (
                  <p className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary">
                    <CheckCircle2 className="size-4 text-success" /> Every product is well above its threshold.
                  </p>
                ) : (
                  <EChart
                    kind="bar"
                    categories={d.stockLevels.map((s) => s.brandName)}
                    series={[
                      {
                        name: "Stock",
                        kind: "number",
                        data: d.stockLevels.map((s) => s.stock),
                      },
                      {
                        name: "Threshold",
                        kind: "number",
                        data: d.stockLevels.map((s) => s.threshold),
                        reference: true,
                      },
                    ]}
                    ariaLabel="Products with stock near their low-stock threshold"
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expiring soon</CardTitle>
                <p className="text-xs text-text-muted">Batches with stock, expired or within 6 months</p>
              </CardHeader>
              <CardContent>
                {d.nearExpiry.length === 0 ? (
                  <p className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary">
                    <CheckCircle2 className="size-4 text-success" /> Nothing expiring soon.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {d.nearExpiry.map((b) => (
                      <li key={b.batchId} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <Link href={`/products/${b.productId}`} className="min-w-0 hover:text-primary">
                          <div className="truncate font-medium">{b.brandName}</div>
                          <div className="font-mono text-xs text-text-muted">{b.batchNumber}</div>
                        </Link>
                        <div className="text-right">
                          <div className="font-mono text-xs">{monYY(b.exp)}</div>
                          <div className="text-xs text-text-muted">{b.stock.toLocaleString()} units</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {canSee("/orders") && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent orders</CardTitle>
                <Link href="/orders" className="text-sm text-primary hover:underline">
                  View all
                </Link>
              </CardHeader>
              <CardContent>
                {d.recentOrders.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-secondary">No orders yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {d.recentOrders.map((o) => (
                        <tr key={o.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <Link
                              href={`/orders/${o.id}`}
                              className="inline-flex items-center gap-2 font-mono text-xs font-medium hover:text-primary"
                            >
                              <FileText className="size-3.5 text-text-muted" />
                              {o.orderNumber}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">{o.customer}</td>
                          <td className="py-2 pr-3">
                            <OrderStatusBadge status={o.status} />
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">{formatUsd(o.total)}</td>
                          <td className="py-2 text-right text-text-secondary">{formatDate(o.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
