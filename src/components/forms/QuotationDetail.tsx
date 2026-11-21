"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  FileOutput,
  Pencil,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/ErrorState";
import { PdfButtons } from "@/components/shared/PdfButtons";
import { PipelineProgress } from "@/components/shared/PipelineProgress";
import { RevisionHistory } from "@/components/shared/RevisionHistory";
import { OrderStatusBadge, QuotationStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { confirmAction, confirmDanger, promptReason, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { cnfTotalLabel, SHIPPING_MODE, TOTAL_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatUsd, monYY } from "@/lib/format";
import type { OrderDetail, QuotationDetail as Quotation } from "@/types/entities";

type Action = "send" | "accept" | "reject" | "convert";

export function QuotationDetail({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { companyId, isAllCompanies, switchCompany } = useCompany();

  const query = useQuery({
    queryKey: ["quotations", "detail", id],
    queryFn: () => api.get<Quotation>(`/api/quotations/${id}`),
  });

  const action = useMutation({
    mutationFn: ({ name, body }: { name: Action; body?: unknown }) =>
      api.post<Quotation | { quotation: Quotation; order: OrderDetail }>(`/api/quotations/${id}/${name}`, body ?? {}),
    onSuccess: (result, { name }) => {
      void queryClient.invalidateQueries({ queryKey: ["quotations"] });
      void queryClient.invalidateQueries({ queryKey: ["revisions"] });
      if (name === "convert" && "order" in result) {
        void queryClient.invalidateQueries({ queryKey: ["orders"] });
        toast.success(`Proforma invoice ${result.order.orderNumber} created`);
        router.push(`/orders/${result.order.id}`);
        return;
      }
      const messages: Record<Action, string> = {
        send: "Marked as sent to the customer",
        accept: "Quotation accepted — ready to convert to a proforma invoice",
        reject: "Quotation rejected",
        convert: "Converted",
      };
      toast.success(messages[name]);
    },
    onError: (err) => showError(errorMessage(err), "Action failed"),
  });

  const remove = useMutation({
    mutationFn: () => api.del<{ id: string }>(`/api/quotations/${id}`),
    onSuccess: () => {
      toast.success("Quotation deleted");
      void queryClient.invalidateQueries({ queryKey: ["quotations"] });
      router.push("/quotations");
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete"),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href="/quotations">
        <ArrowLeft />
        Quotations
      </Link>
    </Button>
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState error={query.error} />
      </div>
    );
  }

  const q = query.data;
  const busy = action.isPending || remove.isPending;
  // Writes need the quotation's company to be the active one (owner "All companies" mode can only read).
  const canAct = !isAllCompanies && companyId === q.companyId;
  const run = (name: Action, body?: unknown) => action.mutate({ name, body });
  const s = q.status;

  const buttons: ReactNode[] = [];
  if (canAct) {
    if (["draft", "sent", "negotiating", "rejected", "accepted"].includes(s) && can("manage_quotations")) {
      buttons.push(
        <Button key="edit" variant="outline" asChild>
          <Link href={`/quotations/${q.id}/edit`}>
            <Pencil />
            {s === "draft" ? "Edit" : "Revise"}
          </Link>
        </Button>,
      );
    }
    if ((s === "sent" || s === "negotiating") && can("approve_quotations")) {
      buttons.push(
        <Button
          key="reject"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={async () => {
            const reason = await promptReason({
              title: `Reject ${q.quotationNumber}?`,
              text: "The customer declined. You can still revise it later, which starts a new draft revision.",
              placeholder: "Why was it rejected?",
              confirmText: "Reject",
              danger: true,
            });
            if (reason) run("reject", { reason });
          }}
        >
          <XCircle />
          Reject
        </Button>,
      );
    }
    if ((s === "draft" || s === "negotiating") && can("manage_quotations")) {
      buttons.push(
        <Button
          key="send"
          variant={s === "draft" ? "default" : "outline"}
          disabled={busy}
          onClick={async () => {
            if (
              await confirmAction({
                title: s === "draft" ? `Mark ${q.quotationNumber} as sent?` : `Re-send revision ${q.revisionNumber}?`,
                text: "Record that this quotation has been sent to the customer.",
                confirmText: "Mark as sent",
              })
            )
              run("send");
          }}
        >
          <Send />
          {s === "draft" ? "Mark as sent" : "Re-send"}
        </Button>,
      );
    }
    if ((s === "sent" || s === "negotiating") && can("approve_quotations")) {
      buttons.push(
        <Button
          key="accept"
          disabled={busy}
          onClick={async () => {
            if (
              await confirmAction({
                title: `Accept ${q.quotationNumber}?`,
                text: "The customer agreed to these prices. Next step: convert it to a proforma invoice.",
                confirmText: "Accept",
              })
            )
              run("accept");
          }}
        >
          <CheckCircle2 />
          Accept
        </Button>,
      );
    }
    if (s === "accepted" && can("manage_proforma_invoices")) {
      buttons.push(
        <Button
          key="convert"
          disabled={busy}
          onClick={async () => {
            if (
              await confirmAction({
                title: `Convert ${q.quotationNumber} to a proforma invoice?`,
                text: "A draft PI is created with the same lines. Freight, bank and other details are switched on — anything left out of the quotation is filled in on the PI.",
                confirmText: "Create proforma invoice",
              })
            )
              run("convert");
          }}
        >
          <FileOutput />
          Convert to PI
        </Button>,
      );
    }
    if (s === "draft" && can("manage_quotations")) {
      buttons.push(
        <Button
          key="delete"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          aria-label="Delete quotation"
          disabled={busy}
          onClick={async () => {
            if (await confirmDanger({ title: `Delete ${q.quotationNumber}?`, text: "The draft is removed from all lists." }))
              remove.mutate();
          }}
        >
          <Trash2 />
        </Button>,
      );
    }
  }

  const goods = q.items.reduce((sum, i) => sum + i.totalUsd, 0);

  return (
    <div className="space-y-6">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{q.quotationNumber}</h1>
            <QuotationStatusBadge status={s} />
            <span className="font-mono text-xs text-text-muted">Rev {q.revisionNumber}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {q.companyName} · Created {formatDate(q.createdAt)}
            {q.createdByName && ` by ${q.createdByName}`}
            {q.sentAt && ` · Sent on ${formatDate(q.sentAt)}`} · Updated {formatDate(q.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{buttons}</div>
      </div>

      <PipelineProgress
        here="quotation"
        canAct={canAct}
        deal={{
          quotation: { id: q.id, status: s },
          order: q.convertedToOrder ? { id: q.convertedToOrder.id, status: q.convertedToOrder.status } : null,
          invoice:
            q.convertedToOrder?.activeInvoiceId && q.convertedToOrder.activeInvoiceStatus
              ? { id: q.convertedToOrder.activeInvoiceId, status: q.convertedToOrder.activeInvoiceStatus }
              : null,
          packingListId: q.convertedToOrder?.packingListId ?? null,
        }}
      />

      {!canAct && (isAllCompanies || companyId !== q.companyId) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-text-secondary">
            <Building2 className="size-4 text-info" />
            This quotation belongs to {q.companyName}. Switch to that company to work on it.
          </span>
          <Button size="sm" variant="outline" onClick={() => switchCompany(q.companyId)}>
            Switch to {q.companyName}
          </Button>
        </div>
      )}

      {s === "converted" && q.convertedToOrder && (
        <Link
          href={`/orders/${q.convertedToOrder.id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-light/50 px-4 py-3 text-sm hover:bg-primary-light"
        >
          <span className="flex items-center gap-2">
            <FileOutput className="size-4 text-primary" />
            Converted to proforma invoice <span className="font-mono font-medium">{q.convertedToOrder.orderNumber}</span>
            {q.convertedAt && <span className="text-text-secondary">· {formatDateTime(q.convertedAt)}</span>}
          </span>
          <span className="flex items-center gap-2">
            <OrderStatusBadge status={q.convertedToOrder.status} />
            <ArrowRight className="size-4 text-primary" />
          </span>
        </Link>
      )}

      {(s === "rejected" || s === "negotiating") && q.rejectionReason && (
        <div
          className={
            s === "rejected"
              ? "flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
              : "flex gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm"
          }
        >
          <CircleAlert className={s === "rejected" ? "mt-0.5 size-4 shrink-0 text-destructive" : "mt-0.5 size-4 shrink-0 text-warning-text"} />
          <div>
            <div className={s === "rejected" ? "font-medium text-destructive" : "font-medium text-warning-text"}>
              {s === "rejected" ? "Rejected" : "Changes requested"}
              {q.rejectedByName ? ` by ${q.rejectedByName}` : ""} · {formatDateTime(q.rejectedAt)}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-text-secondary">{q.rejectionReason}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 text-sm">
            <div className="font-medium">{q.customer.businessName || q.customer.name}</div>
            {q.customer.businessName && <div className="text-text-secondary">{q.customer.name}</div>}
            <div className="text-text-secondary">
              {[q.customer.address, q.customer.city, q.customer.country].filter(Boolean).join(", ")}
            </div>
            <div className="pt-1 font-mono text-xs text-text-muted">
              {q.customer.customerNumber} · {q.customer.code}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quotation document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-text-secondary">
              Prints the sections that are switched on. Batches aren&apos;t shown — they&apos;re assigned on the proforma
              invoice.
            </p>
            <PdfButtons path={`/api/quotations/${q.id}/pdf`} label="Quotation PDF" size="sm" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Print options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Included label="Freight & C&F" on={q.showFreight} />
            <Included label="Bank details" on={q.showBankDetails} />
            <Included label="Notes & other details" on={q.showOtherDetails} />
            <div className="pt-1 text-xs text-text-secondary">
              Columns:{" "}
              {[q.showGenericName && "Generic name", q.showMfd && "MFD", q.showExp && "EXP"].filter(Boolean).join(", ") ||
                "none"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-text-secondary">
              <tr className="border-b">
                <th className="py-2 pr-3 text-left font-medium">#</th>
                <th className="py-2 pr-3 text-left font-medium">Product</th>
                <th className="py-2 pr-3 text-left font-medium">MNF</th>
                <th className="py-2 pr-3 text-left font-medium">MFD</th>
                <th className="py-2 pr-3 text-left font-medium">EXP</th>
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 pr-3 text-right font-medium">Unit price</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((item, i) => (
                <tr key={item.id} className="border-t">
                  <td className="py-2 pr-3 font-mono text-xs text-text-muted">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{item.brandName}</div>
                    {item.genericName && <div className="text-xs text-text-secondary">{item.genericName}</div>}
                  </td>
                  <td className="py-2 pr-3 text-text-secondary">{item.manufacturerName ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{monYY(item.mfd)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{monYY(item.exp)}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {item.quantity.toLocaleString()} {item.unit}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">{formatUsd(item.sellingPriceUsd)}</td>
                  <td className="py-2 text-right font-mono">{formatUsd(item.totalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-text-muted">MFD/EXP are indicative — the actual batches are assigned later.</p>

          <div className="mt-4 ml-auto max-w-sm space-y-1 rounded-lg border bg-muted/30 p-4 text-sm">
            <Row label={TOTAL_LABELS.subTotal} value={goods} />
            {q.showFreight && <Row label={TOTAL_LABELS.charges} value={q.airFreight + q.handlingDocumentation} />}
            <Row
              label={q.showFreight ? cnfTotalLabel(q.cnfDestination) : "Total"}
              value={q.totalCnf}
              strong
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Freight & C&F" on={q.showFreight}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="C&F destination" value={q.cnfDestination} />
            <Field label="Shipping" value={SHIPPING_MODE} />
          </dl>
        </SectionCard>
        <SectionCard title="Bank details" on={q.showBankDetails}>
          {q.bank ? (
            <div className="space-y-0.5 text-sm">
              <div className="font-medium">{q.bank.bankName}</div>
              <div className="font-mono">{q.bank.accountNumber}</div>
              {q.bank.swiftCode && <div className="text-text-secondary">SWIFT {q.bank.swiftCode}</div>}
              {q.bank.branchName && <div className="text-text-secondary">{q.bank.branchName}</div>}
            </div>
          ) : (
            <span className="text-sm text-text-secondary">No bank account selected.</span>
          )}
        </SectionCard>
        <SectionCard title="Notes & other details" on={q.showOtherDetails}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Payment terms" value={q.paymentTerms} />
            <Field label="Marks" value={q.marks} />
            <Field label="Notes" value={q.notes} wide />
          </dl>
        </SectionCard>
      </div>

      <RevisionHistory documentType="quotation" documentId={q.id} />
    </div>
  );
}

function SectionCard({ title, on, children }: { title: string; on: boolean; children: ReactNode }) {
  return (
    <Card className={on ? undefined : "border-dashed bg-background shadow-none"}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{on ? children : <p className="text-sm text-text-muted italic">Not included on this quotation.</p>}</CardContent>
    </Card>
  );
}

function Included({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={on ? "text-xs font-medium text-success-text" : "text-xs text-text-muted"}>{on ? "Included" : "Off"}</span>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between border-t pt-2 font-semibold" : "flex justify-between"}>
      <span>{label}</span>
      <span className="font-mono">{formatUsd(value)}</span>
    </div>
  );
}

function Field({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value || <span className="text-text-muted">—</span>}</dd>
    </div>
  );
}
