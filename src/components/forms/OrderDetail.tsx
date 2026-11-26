"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Boxes,
  Building2,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  FileText,
  Lock,
  PenTool,
  Pencil,
  Receipt,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/ErrorState";
import { PdfButtons } from "@/components/shared/PdfButtons";
import { PipelineProgress } from "@/components/shared/PipelineProgress";
import { RevisionHistory } from "@/components/shared/RevisionHistory";
import { DocumentTypeBadge, InvoiceStatusBadge, OrderStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { confirmAction, confirmDanger, confirmInfo, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { cnfTotalLabel, SHIPPING_MODE, TOTAL_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatUsd, monYY } from "@/lib/format";
import type { OrderDetail as Order } from "@/types/entities";

type Action = "send" | "confirm" | "undo-batches" | "cancel" | "finalize" | "complete";

/** Actions that only change the status (no stock, no new documents) — shown before the server answers. */
const OPTIMISTIC_STATUS: Partial<Record<Action, Order["status"]>> = { send: "sent", confirm: "confirmed" };

export function OrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { companyId, isAllCompanies, switchCompany } = useCompany();

  const query = useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: () => api.get<Order>(`/api/orders/${id}`),
  });

  const detailKey = ["orders", "detail", id];
  const action = useMutation({
    mutationFn: ({ name, body }: { name: Action; body?: unknown }) =>
      api.post<Order | { id: string; invoiceNumber: string; packingListCopiedFrom: string | null }>(
        `/api/orders/${id}/${name}`,
        body ?? {},
      ),
    // Pure status changes show instantly; rolled back if the server refuses.
    onMutate: async ({ name }) => {
      const optimistic = OPTIMISTIC_STATUS[name];
      if (!optimistic) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<Order>(detailKey);
      if (previous) queryClient.setQueryData<Order>(detailKey, { ...previous, status: optimistic });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(detailKey, ctx.previous);
      showError(errorMessage(err), "Action failed");
    },
    onSuccess: (result, { name }) => {
      // The response IS the updated order — use it instead of waiting for a refetch of this page.
      const isOrder = "items" in result && "orderNumber" in result;
      if (isOrder) queryClient.setQueryData(detailKey, result);
      for (const key of ["orders", "batches", "products", "invoices", "revisions", "quotations"]) {
        void queryClient.invalidateQueries({
          queryKey: [key],
          // Lists etc. refresh in the background; this page's detail was just set from the response.
          predicate: (q) => !isOrder || q.queryKey.join("/") !== detailKey.join("/"),
        });
      }
      const messages: Record<Action, string> = {
        send: "Marked as sent to the customer",
        confirm: "Proforma invoice confirmed — ready for batch assignment",
        "undo-batches": "Batch assignment undone — stock restored",
        cancel: "Order cancelled",
        finalize: "Invoice created",
        complete: "Order completed",
      };
      toast.success(messages[name]);
      if (name === "finalize" && "invoiceNumber" in result) {
        if (result.packingListCopiedFrom) toast.info(`Packing list copied from previous invoice ${result.packingListCopiedFrom}`);
        router.push(`/invoices/${result.id}`);
      }
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del<{ id: string; quotationReopened: { id: string; quotationNumber: string } | null }>(`/api/orders/${id}`),
    onSuccess: (res) => {
      toast.success(
        res.quotationReopened
          ? `Proforma invoice deleted — ${res.quotationReopened.quotationNumber} is accepted again`
          : "Proforma invoice deleted",
      );
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["quotations"] });
      router.push("/orders");
    },
    onError: (err) => showError(errorMessage(err), "Cannot delete"),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href="/orders">
        <ArrowLeft />
        Orders
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

  const o = query.data;
  const s = o.status;
  const busy = action.isPending || remove.isPending;
  // Writes need the order's company to be the active one (owner "All companies" mode can only read).
  const canAct = !isAllCompanies && companyId === o.companyId;
  const run = (name: Action, body?: unknown) => action.mutate({ name, body });

  const buttons: ReactNode[] = [];
  if (canAct) {
    if (["draft", "sent", "negotiating", "confirmed"].includes(s) && can("manage_proforma_invoices")) {
      buttons.push(
        <Button key="edit" variant="outline" asChild>
          <Link href={`/orders/${o.id}/edit`}>
            <Pencil />
            {s === "draft" ? "Edit" : "Revise"}
          </Link>
        </Button>,
      );
    }
    if ((s === "draft" || s === "negotiating") && can("manage_proforma_invoices")) {
      buttons.push(
        <Button
          key="send"
          variant={s === "draft" ? "default" : "outline"}
          disabled={busy}
          onClick={async () => {
            if (
              await confirmAction({
                title: s === "draft" ? `Mark ${o.orderNumber} as sent?` : `Re-send revision ${o.revisionNumber}?`,
                text: "Record that this proforma invoice has been sent to the customer.",
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
    if ((s === "sent" || s === "negotiating") && can("approve_proforma_invoices")) {
      buttons.push(
        <Button
          key="confirm"
          disabled={busy}
          onClick={async () => {
            // Check which optional party/signature details are missing
            const missing: string[] = [];
            if (!o.consigneeName) missing.push("Consignee");
            if (!o.notifyName && !o.notifyContactPerson) missing.push("Notify party");
            if (!o.signatureId) missing.push("E-signature");

            // Non-blocking info warning if anything is missing
            if (missing.length > 0) {
              const proceed = await confirmInfo({
                title: "Some details aren't filled in yet",
                html:
                  `<p style="margin-bottom:8px">The following haven't been added to this proforma invoice:</p>` +
                  `<ul style="text-align:left;margin:0 auto;display:inline-block">${missing.map((m) => `<li>• ${m}</li>`).join("")}</ul>` +
                  `<p style="margin-top:8px;font-size:0.85em;color:#64748B">They'll auto-populate from the customer record or latest invoice when the commercial invoice is created.</p>`,
              });
              if (!proceed) return;
            }

            if (
              await confirmAction({
                title: `Customer confirmed ${o.orderNumber}?`,
                text: "No stock is reserved yet — the warehouse assigns batches next.",
                confirmText: "Confirm",
              })
            )
              run("confirm");
          }}
        >
          <CheckCircle2 />
          Confirm
        </Button>,
      );
    }
    if (s === "confirmed" && can("approve_orders")) {
      buttons.push(
        <Button key="assign" asChild>
          <Link href={`/orders/${o.id}/assign-batches`}>
            <Boxes />
            Assign batches
          </Link>
        </Button>,
      );
    }
    if (s === "batch_assigned" && can("approve_orders")) {
      buttons.push(
        <Button key="edit-batches" variant="outline" asChild>
          <Link href={`/orders/${o.id}/assign-batches`}>
            <Boxes />
            Edit batches
          </Link>
        </Button>,
      );
      buttons.push(
        <Button
          key="undo"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (
              await confirmAction({
                title: "Undo batch assignment?",
                text: "Assigned quantities go back into stock and the proforma invoice returns to Confirmed.",
                confirmText: "Undo assignment",
              })
            )
              run("undo-batches");
          }}
        >
          <Undo2 />
          Undo batches
        </Button>,
      );
    }
    if (s === "batch_assigned" && can("manage_invoices")) {
      const enforced = [
        !o.showFreight && "freight",
        !o.showBankDetails && "bank details",
        !o.showOtherDetails && "other details",
      ].filter(Boolean);
      buttons.push(
        <Button
          key="finalize"
          disabled={busy}
          onClick={async () => {
            if (
              await confirmAction({
                title: `Create the invoice for ${o.orderNumber}?`,
                text:
                  "A draft invoice is created as an exact copy of this order. You can then add the parties and signature." +
                  (enforced.length
                    ? ` This PI left out ${enforced.join(", ")} — those must be completed on the invoice before it can be issued.`
                    : ""),
                confirmText: "Create invoice",
              })
            )
              run("finalize");
          }}
        >
          <FileCheck2 />
          Create invoice
        </Button>,
      );
    }
    if (s === "invoiced" && can("manage_orders")) {
      buttons.push(
        <Button
          key="complete"
          disabled={busy || o.activeInvoice?.status !== "issued"}
          title={o.activeInvoice?.status !== "issued" ? "Issue the invoice first" : undefined}
          onClick={async () => {
            if (await confirmAction({ title: "Mark as completed?", text: "Use this once payment has been received.", confirmText: "Complete" }))
              run("complete");
          }}
        >
          <CheckCircle2 />
          Complete
        </Button>,
      );
    }
    const cancelPermission = s === "batch_assigned" ? "approve_orders" : "manage_proforma_invoices";
    if (["draft", "sent", "negotiating", "confirmed", "batch_assigned"].includes(s) && can(cancelPermission)) {
      buttons.push(
        <Button
          key="cancel"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={async () => {
            if (
              await confirmDanger({
                title: `Cancel ${o.orderNumber}?`,
                text:
                  s === "batch_assigned"
                    ? "Assigned stock is returned to the batches, then the order is cancelled."
                    : "The proforma invoice is kept for history but can no longer be used.",
                confirmText: "Cancel order",
              })
            )
              run("cancel");
          }}
        >
          <Ban />
          Cancel
        </Button>,
      );
    }
    if (s === "draft" && can("manage_proforma_invoices")) {
      buttons.push(
        <Button
          key="delete"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          aria-label="Delete proforma invoice"
          disabled={busy}
          onClick={async () => {
            if (
              await confirmDanger({
                title: `Delete ${o.orderNumber}?`,
                text: o.sourceQuotation
                  ? `The draft is removed and ${o.sourceQuotation.quotationNumber} goes back to Accepted so it can be converted again.`
                  : "The draft is removed from all lists.",
              })
            )
              remove.mutate();
          }}
        >
          <Trash2 />
        </Button>,
      );
    }
  }

  const goods = o.items.reduce((sum, i) => sum + i.totalUsd, 0);
  // Lines split across batches share sort_order — group them for display.
  const groups = new Map<number, Order["items"]>();
  for (const item of o.items) groups.set(item.sortOrder, [...(groups.get(item.sortOrder) ?? []), item]);
  const hasBatches = o.items.some((i) => i.batchId);
  // Sections a CI will have to complete. Once invoiced, the CI shows everything anyway.
  const beforeInvoice = ["draft", "sent", "negotiating", "confirmed", "batch_assigned"].includes(s);

  return (
    <div className="space-y-6">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{o.orderNumber}</h1>
            <DocumentTypeBadge type={o.documentType} full />
            <OrderStatusBadge status={s} />
            <span className="font-mono text-xs text-text-muted">Rev {o.revisionNumber}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {o.companyName} · Created {formatDate(o.createdAt)}
            {o.createdByName && ` by ${o.createdByName}`}
            {o.sentAt && ` · Sent on ${formatDate(o.sentAt)}`}
            {o.approvedAt && ` · Confirmed ${formatDate(o.approvedAt)}${o.approvedByName ? ` by ${o.approvedByName}` : ""}`}
          </p>
          {o.sourceQuotation && (
            <Link
              href={`/quotations/${o.sourceQuotation.id}`}
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <FileText className="size-3.5" />
              From quotation <span className="font-mono">{o.sourceQuotation.quotationNumber}</span>
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">{buttons}</div>
      </div>

      <PipelineProgress
        here="proforma"
        canAct={canAct}
        deal={{
          quotation: o.sourceQuotation ? { id: o.sourceQuotation.id, status: "converted" } : null,
          order: { id: o.id, status: s },
          invoice: o.activeInvoice ? { id: o.activeInvoice.id, status: o.activeInvoice.status } : null,
          packingListId: o.activeInvoice?.packingListId ?? null,
        }}
      />

      {!canAct && (isAllCompanies || companyId !== o.companyId) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-text-secondary">
            <Building2 className="size-4 text-info" />
            This order belongs to {o.companyName}. Switch to that company to work on it.
          </span>
          <Button size="sm" variant="outline" onClick={() => switchCompany(o.companyId)}>
            Switch to {o.companyName}
          </Button>
        </div>
      )}

      {s === "negotiating" && o.rejectionReason && (
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-text" />
          <div>
            <div className="font-medium text-warning-text">
              Changes requested{o.rejectedByName ? ` · recorded by ${o.rejectedByName}` : ""} · {formatDateTime(o.rejectedAt)}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-text-secondary">{o.rejectionReason}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 text-sm">
            <div className="font-medium">{o.customer.businessName || o.customer.name}</div>
            {o.customer.businessName && <div className="text-text-secondary">{o.customer.name}</div>}
            <div className="text-text-secondary">
              {[o.customer.address, o.customer.city, o.customer.country].filter(Boolean).join(", ")}
            </div>
            <div className="pt-1 font-mono text-xs text-text-muted">
              {o.customer.customerNumber} · {o.customer.code}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proforma invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1">
              <Included label="Freight & C&F" on={o.showFreight} />
              <Included label="Bank details" on={o.showBankDetails} />
              <Included label="Notes & other details" on={o.showOtherDetails} />
            </div>
            <div className="flex flex-wrap gap-2">
              <PdfButtons path={`/api/orders/${o.id}/pdf`} label="Proforma PDF" size="sm" />
              {/* What the invoice will look like with the assigned batches — before it is created. */}
              {s === "batch_assigned" && (
                <PdfButtons path={`/api/orders/${o.id}/invoice-preview`} label="Invoice preview" size="sm" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {o.invoices.length === 0 && (
              <div className="text-text-secondary">
                {s === "batch_assigned" ? "Ready to create." : "Created once batches are assigned."}
              </div>
            )}
            {o.invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted"
              >
                <span className="flex items-center gap-2 font-mono text-xs">
                  <Receipt className="size-4 text-text-muted" />
                  {inv.invoiceNumber}
                </span>
                <InvoiceStatusBadge status={inv.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-xs text-text-secondary">
              <tr className="border-b">
                <th className="py-2 pr-3 text-left font-medium">#</th>
                <th className="py-2 pr-3 text-left font-medium">Product</th>
                <th className="py-2 pr-3 text-left font-medium">MNF</th>
                <th className="py-2 pr-3 text-left font-medium">MFD</th>
                <th className="py-2 pr-3 text-left font-medium">EXP</th>
                {hasBatches && <th className="py-2 pr-3 text-left font-medium">Batch</th>}
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 pr-3 text-right font-medium">Unit price</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...groups.values()].map((lines, gi) =>
                lines.map((item, li) => (
                  <tr key={item.id} className={li === 0 ? "border-t" : ""}>
                    <td className="py-2 pr-3 font-mono text-xs text-text-muted">{li === 0 ? gi + 1 : ""}</td>
                    <td className="py-2 pr-3">
                      {li === 0 && (
                        <>
                          <div className="font-medium">{item.brandName}</div>
                          {item.genericName && <div className="text-xs text-text-secondary">{item.genericName}</div>}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">{li === 0 ? (item.manufacturerName ?? "—") : ""}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{monYY(item.batchMfd ?? item.mfd)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{monYY(item.batchExp ?? item.exp)}</td>
                    {hasBatches && <td className="py-2 pr-3 font-mono text-xs">{item.batchNumber ?? "—"}</td>}
                    <td className="py-2 pr-3 text-right font-mono">
                      {item.quantity.toLocaleString()} {item.unit}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{formatUsd(item.sellingPriceUsd)}</td>
                    <td className="py-2 text-right font-mono">{formatUsd(item.totalUsd)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-text-muted">
            {hasBatches
              ? "MFD/EXP shown from the assigned batch where one is assigned."
              : "MFD/EXP are indicative until the warehouse assigns batches."}
          </p>

          <div className="mt-4 ml-auto max-w-sm space-y-1 rounded-lg border bg-muted/30 p-4 text-sm">
            <Row label={TOTAL_LABELS.subTotal} value={goods} />
            {o.showFreight && <Row label={TOTAL_LABELS.charges} value={o.airFreight + o.handlingDocumentation} />}
            <Row
              label={o.showFreight ? cnfTotalLabel(o.cnfDestination) : "Total"}
              value={o.totalCnf}
              strong
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Freight & C&F" on={o.showFreight} enforceNote={beforeInvoice}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="C&F destination" value={o.cnfDestination} />
            <Field label="Shipping" value={SHIPPING_MODE} />
          </dl>
        </SectionCard>
        <SectionCard title="Bank details" on={o.showBankDetails} enforceNote={beforeInvoice}>
          {o.bank ? (
            <div className="space-y-0.5 text-sm">
              <div className="font-medium">{o.bank.bankName}</div>
              <div className="font-mono">{o.bank.accountNumber}</div>
              {o.bank.swiftCode && <div className="text-text-secondary">SWIFT {o.bank.swiftCode}</div>}
              {o.bank.branchName && <div className="text-text-secondary">{o.bank.branchName}</div>}
            </div>
          ) : (
            <span className="text-sm text-text-secondary">No bank account selected.</span>
          )}
        </SectionCard>
        <SectionCard title="Notes & other details" on={o.showOtherDetails} enforceNote={beforeInvoice}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Payment terms" value={o.paymentTerms} />
            <Field label="Marks" value={o.marks} />
            <Field label="Notes" value={o.notes} wide />
          </dl>
        </SectionCard>
      </div>

      <PartySection order={o} />

      <RevisionHistory documentType="proforma_invoice" documentId={o.id} />
    </div>
  );
}

/** Read-only display of optional party & signature fields pre-filled on this PI. */
function PartySection({ order: o }: { order: Order }) {
  const hasConsignee = o.consigneeName || o.consigneeAddress || o.consigneeCountry || o.consigneePhone || o.consigneeEmail;
  const hasNotify = o.notifyName || o.notifyAddress || o.notifyCountry || o.notifyPhone || o.notifyContactPerson;
  const hasOrdering = o.orderingName || o.orderingAddress || o.orderingCountry || o.orderingPhone;
  const hasSignature = !!o.signatureId;

  if (!hasConsignee && !hasNotify && !hasOrdering && !hasSignature) return null;

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PenTool className="size-4 text-primary" />
          Parties &amp; signature
          <span className="text-xs font-normal text-text-muted">(pre-filled for the invoice)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-3">
          {hasConsignee && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Consignee</h4>
              <dl className="space-y-1.5 text-sm">
                {o.consigneeName && <PartyRow label="Name" value={o.consigneeName} />}
                {o.consigneeAddress && <PartyRow label="Address" value={o.consigneeAddress} />}
                {o.consigneeCountry && <PartyRow label="Country" value={o.consigneeCountry} />}
                {o.consigneePhone && <PartyRow label="Phone" value={o.consigneePhone} />}
                {o.consigneeEmail && <PartyRow label="Email" value={o.consigneeEmail} />}
              </dl>
            </div>
          )}
          {hasNotify && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Notify party</h4>
              <dl className="space-y-1.5 text-sm">
                {o.notifyName && <PartyRow label="Name" value={o.notifyName} />}
                {o.notifyContactPerson && <PartyRow label="Contact" value={o.notifyContactPerson} />}
                {o.notifyAddress && <PartyRow label="Address" value={o.notifyAddress} />}
                {o.notifyCountry && <PartyRow label="Country" value={o.notifyCountry} />}
                {o.notifyPhone && <PartyRow label="Phone" value={o.notifyPhone} />}
              </dl>
            </div>
          )}
          {hasOrdering && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Ordering party</h4>
              <dl className="space-y-1.5 text-sm">
                {o.orderingName && <PartyRow label="Name" value={o.orderingName} />}
                {o.orderingAddress && <PartyRow label="Address" value={o.orderingAddress} />}
                {o.orderingCountry && <PartyRow label="Country" value={o.orderingCountry} />}
                {o.orderingPhone && <PartyRow label="Phone" value={o.orderingPhone} />}
              </dl>
            </div>
          )}
        </div>
        {hasSignature && (
          <div className="mt-4 border-t pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">E-signature</span>
            <p className="mt-1 text-sm text-text-secondary">
              <span className="font-medium text-foreground">{o.signature?.label ?? "Selected"}</span> — will be printed on the
              invoice.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PartyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-xs font-medium text-text-secondary">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function SectionCard({
  title,
  on,
  enforceNote,
  children,
}: {
  title: string;
  on: boolean;
  /** Explain that a section left off here is enforced on the invoice. */
  enforceNote: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={on ? undefined : "border-dashed bg-background shadow-none"}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {on ? (
          children
        ) : (
          <div className="space-y-1.5 text-sm">
            <p className="text-text-muted italic">Not included on this proforma invoice.</p>
            {enforceNote && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-warning-text">
                <Lock className="size-3" />
                Required on the invoice.
              </p>
            )}
          </div>
        )}
      </CardContent>
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
