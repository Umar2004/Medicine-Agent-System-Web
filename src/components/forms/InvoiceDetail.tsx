"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Building2, CheckCircle2, CircleAlert, FileCheck2, Loader2, Lock, Package, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch, type UseFormRegister } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { SignaturePicker } from "@/components/forms/SignaturePicker";
import { EntityCombobox } from "@/components/shared/EntityCombobox";
import { ErrorState } from "@/components/shared/ErrorState";
import { PdfButtons } from "@/components/shared/PdfButtons";
import { PipelineProgress } from "@/components/shared/PipelineProgress";
import { InvoiceStatusBadge, OrderStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { confirmAction, confirmDanger, promptReason, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatUsd, monYY } from "@/lib/format";
import { toCents } from "@/lib/money";
import { usdAmountInWords } from "@/lib/number-to-words";
import { cn } from "@/lib/utils";
import { cnfTotalLabel, DOCUMENT_SECTIONS, TOTAL_LABELS, type DocumentSection } from "@/lib/constants";
import { dealFromInvoice } from "@/lib/pipeline";
import {
  ENFORCED_SECTION_FIELDS,
  invoiceUpdateSchema,
  missingEnforcedSections,
  type InvoiceUpdateInput,
} from "@/lib/validations/invoices";
import type { BankAccount, InvoiceDetail as Invoice } from "@/types/entities";

function toForm(inv: Invoice): InvoiceUpdateInput {
  const s = (v: string | null) => v ?? "";
  return {
    consigneeName: s(inv.consigneeName),
    consigneeAddress: s(inv.consigneeAddress),
    consigneeCountry: s(inv.consigneeCountry),
    consigneePhone: s(inv.consigneePhone),
    consigneeEmail: s(inv.consigneeEmail),
    notifyName: s(inv.notifyName),
    notifyAddress: s(inv.notifyAddress),
    notifyCountry: s(inv.notifyCountry),
    notifyPhone: s(inv.notifyPhone),
    notifyContactPerson: s(inv.notifyContactPerson),
    orderingName: s(inv.orderingName),
    orderingAddress: s(inv.orderingAddress),
    orderingCountry: s(inv.orderingCountry),
    orderingPhone: s(inv.orderingPhone),
    cnfDestination: s(inv.cnfDestination),
    marks: s(inv.marks),
    paymentTerms: s(inv.paymentTerms),
    notes: s(inv.notes),
    bankDetailId: s(inv.bankDetailId),
    signatureId: s(inv.signatureId),
  };
}

const SECTION_TITLES: Record<DocumentSection, string> = {
  freight: "Freight & C&F",
  bank_details: "Bank details",
  other_details: "Notes & other details",
};

type PartyKey = "consignee" | "notify" | "ordering";
type CopyParty = "notify" | "ordering";
/** Fields a "Same as consignee" toggle copies (the notify contact person stays the user's own). */
const SAME_AS_CONSIGNEE: Record<CopyParty, [keyof InvoiceUpdateInput, keyof InvoiceUpdateInput][]> = {
  notify: [
    ["consigneeName", "notifyName"],
    ["consigneeAddress", "notifyAddress"],
    ["consigneeCountry", "notifyCountry"],
    ["consigneePhone", "notifyPhone"],
  ],
  ordering: [
    ["consigneeName", "orderingName"],
    ["consigneeAddress", "orderingAddress"],
    ["consigneeCountry", "orderingCountry"],
    ["consigneePhone", "orderingPhone"],
  ],
};

const PARTIES: { key: PartyKey; title: string; hint: string; fields: [keyof InvoiceUpdateInput, string][] }[] = [
  {
    key: "consignee",
    title: "Consignee",
    hint: "Who receives the goods. Consignee name is required before issuing.",
    fields: [
      ["consigneeName", "Name"],
      ["consigneeAddress", "Address"],
      ["consigneeCountry", "Country"],
      ["consigneePhone", "Phone"],
      ["consigneeEmail", "Email"],
    ],
  },
  {
    key: "notify",
    title: "Notify party",
    hint: "Who is notified on arrival.",
    fields: [
      ["notifyName", "Name"],
      ["notifyAddress", "Address"],
      ["notifyCountry", "Country"],
      ["notifyPhone", "Phone"],
      ["notifyContactPerson", "Contact person"],
    ],
  },
  {
    key: "ordering",
    title: "Ordering party",
    hint: "Who placed the order, if different.",
    fields: [
      ["orderingName", "Name"],
      ["orderingAddress", "Address"],
      ["orderingCountry", "Country"],
      ["orderingPhone", "Phone"],
    ],
  },
];

export function InvoiceDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { can, canSee } = usePermissions();
  const { companyId, isAllCompanies, switchCompany } = useCompany();

  const query = useQuery({
    queryKey: ["invoices", "detail", id],
    queryFn: () => api.get<Invoice>(`/api/invoices/${id}`),
  });
  const inv = query.data;
  const canAct = !!inv && !isAllCompanies && companyId === inv.companyId && can("manage_invoices");
  const editable = canAct && inv?.status === "draft";

  const banks = useQuery({
    queryKey: ["bank-details", companyId, "options"],
    queryFn: () => api.list<BankAccount>("/api/bank-details", { pageSize: 200 }),
    enabled: editable,
  });

  const form = useForm<InvoiceUpdateInput>({ resolver: zodResolver(invoiceUpdateSchema) });
  const { register, control, handleSubmit, reset, formState, getValues, setValue } = form;
  useEffect(() => {
    if (inv) reset(toForm(inv));
  }, [inv, reset]);

  // "Same as consignee" (UI-only, not saved): while on, the party mirrors the consignee and is read-only.
  const [sameAs, setSameAs] = useState<Record<CopyParty, boolean>>({ notify: false, ordering: false });
  const [consigneeName = "", consigneeAddress = "", consigneeCountry = "", consigneePhone = ""] = useWatch({
    control,
    name: ["consigneeName", "consigneeAddress", "consigneeCountry", "consigneePhone"],
  });
  useEffect(() => {
    const current: Partial<Record<keyof InvoiceUpdateInput, string>> = {
      consigneeName,
      consigneeAddress,
      consigneeCountry,
      consigneePhone,
    };
    for (const party of ["notify", "ordering"] as const) {
      if (!sameAs[party]) continue;
      for (const [from, to] of SAME_AS_CONSIGNEE[party]) {
        const value = current[from] ?? "";
        if (getValues(to) !== value) setValue(to, value, { shouldDirty: true, shouldValidate: true });
      }
    }
  }, [sameAs, consigneeName, consigneeAddress, consigneeCountry, consigneePhone, getValues, setValue]);
  const mirrored = (field: keyof InvoiceUpdateInput) =>
    (["notify", "ordering"] as const).some((p) => sameAs[p] && SAME_AS_CONSIGNEE[p].some(([, to]) => to === field));

  // Section enforcement: sections the PI left out must be completed here before issuing.
  // While editing, check the live form values; otherwise use the server's view.
  const [cnfDestination, bankDetailId, paymentTerms] = useWatch({
    control,
    name: ["cnfDestination", "bankDetailId", "paymentTerms"],
  });
  const enforced = DOCUMENT_SECTIONS.filter((section) => inv?.sectionEnforcement?.[section]);
  const missing = !inv
    ? []
    : editable
      ? missingEnforcedSections(inv.sectionEnforcement, { cnfDestination, bankDetailId, paymentTerms })
      : inv.missingEnforcedSections;
  const isEnforcedField = (field: keyof InvoiceUpdateInput) =>
    enforced.some((section) => ENFORCED_SECTION_FIELDS[section].field === field);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["quotations"] });
  };

  const save = useMutation({
    mutationFn: (values: InvoiceUpdateInput) => api.put<Invoice>(`/api/invoices/${id}`, values),
    onSuccess: (saved) => {
      toast.success("Invoice saved");
      queryClient.setQueryData(["invoices", "detail", id], saved);
      refresh();
    },
    onError: (err) => showError(errorMessage(err), "Could not save invoice"),
  });
  const issue = useMutation({
    mutationFn: () => api.post<Invoice>(`/api/invoices/${id}/issue`),
    onSuccess: () => {
      toast.success("Invoice issued");
      refresh();
    },
    onError: (err) => showError(errorMessage(err), "Could not issue invoice"),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post<Invoice>(`/api/invoices/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success("Invoice cancelled — the proforma invoice is back to Batches assigned");
      refresh();
    },
    onError: (err) => showError(errorMessage(err), "Could not cancel invoice"),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href="/invoices">
        <ArrowLeft />
        Invoices
      </Link>
    </Button>
  );

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.isError || !inv) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState error={query.error} />
      </div>
    );
  }

  const busy = save.isPending || issue.isPending || cancel.isPending;
  const consigneeMissing = !consigneeName.trim();
  // Why issuing is blocked right now (live form values while editing).
  const issueBlocker = consigneeMissing
    ? "Consignee name is required"
    : missing.length > 0
      ? `Complete first: ${missing.map((m) => m.label).join(", ")}`
      : undefined;
  const invoiceNumber = inv.invoiceNumber;

  async function confirmIssue() {
    if (
      await confirmAction({
        title: `Issue ${invoiceNumber}?`,
        text: "An issued invoice can no longer be edited. To change it later, cancel it and create a new one from the proforma invoice (it gets a new number).",
        confirmText: "Issue invoice",
      })
    )
      issue.mutate();
  }

  /** Save the draft, then (only if that worked) go on to the issue confirmation. */
  function saveAndIssue() {
    return handleSubmit(async (values) => {
      try {
        await save.mutateAsync(values);
      } catch {
        return; // save's onError already showed the alert
      }
      await confirmIssue();
    })();
  }
  const goods = inv.items.reduce((s, i) => s + i.lineTotal, 0);

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-text-muted uppercase">Invoice</p>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{inv.invoiceNumber}</h1>
            <InvoiceStatusBadge status={inv.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {inv.companyName} · {formatDate(inv.createdAt)}
            {inv.createdByName && ` by ${inv.createdByName}`}
            {inv.orderId && (
              <>
                {" · From proforma invoice "}
                <Link href={`/orders/${inv.orderId}`} className="font-mono text-primary hover:underline">
                  {inv.orderNumber}
                </Link>
              </>
            )}
            {inv.orderStatus && (
              <span className="ml-2 align-middle">
                <OrderStatusBadge status={inv.orderStatus} />
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PdfButtons path={`/api/invoices/${inv.id}/pdf`} label="Invoice PDF" />
          {inv.status !== "cancelled" && canSee("/packing") && (
            <Button type="button" variant="outline" asChild>
              <Link href={`/invoices/${inv.id}/packing`}>
                <Package />
                Packing list
              </Link>
            </Button>
          )}
        </div>
        {canAct && inv.status !== "cancelled" && (
          <div className="flex flex-wrap gap-2">
            {editable && formState.isDirty && (
              <Button type="submit" variant="outline" disabled={busy}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                Save draft
              </Button>
            )}
            {editable && (
              // A disabled button gets no pointer events, so the reason sits on a wrapper.
              <span title={issueBlocker} className="inline-flex">
                <Button
                  type="button"
                  disabled={busy || !!issueBlocker}
                  onClick={formState.isDirty ? () => void saveAndIssue() : () => void confirmIssue()}
                >
                  {issue.isPending ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
                  {formState.isDirty ? "Save & issue" : "Issue invoice"}
                </Button>
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={async () => {
                // A completed order means payment was received — make reopening it a deliberate choice.
                if (
                  inv.orderStatus === "completed" &&
                  !(await confirmDanger({
                    title: "This order is marked as completed",
                    text: "Payment has been received for it. Cancelling this invoice will reopen the order. Are you sure you want to proceed?",
                    confirmText: "Yes, reopen the order",
                  }))
                ) {
                  return;
                }
                // CLAUDE.md §7.5: SweetAlert2 confirmation is mandatory.
                const ok = await confirmDanger({
                  title: `Cancel invoice ${inv.invoiceNumber}?`,
                  text: "The proforma invoice goes back to “Batches assigned”. Stock stays deducted and batches stay assigned — use “Undo batches” on the PI to release stock.",
                  confirmText: "Yes, cancel invoice",
                });
                if (!ok) return;
                const reason = await promptReason({ title: "Reason for cancellation", danger: true, confirmText: "Cancel invoice" });
                if (reason) cancel.mutate(reason);
              }}
            >
              <Ban />
              Cancel invoice
            </Button>
          </div>
        )}
      </div>

      {dealFromInvoice(inv) && (
        <PipelineProgress
          here="commercial_invoice"
          canAct={!isAllCompanies && companyId === inv.companyId}
          deal={dealFromInvoice(inv)!}
        />
      )}

      {!isAllCompanies && companyId === inv.companyId ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-text-secondary">
            <Building2 className="size-4 text-info" />
            This invoice belongs to {inv.companyName}. Switch to that company to edit it.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => switchCompany(inv.companyId)}>
            Switch to {inv.companyName}
          </Button>
        </div>
      )}

      {enforced.length > 0 && inv.status !== "cancelled" && (
        <div
          className={
            missing.length > 0
              ? "rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm"
              : "rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm"
          }
        >
          <div className="flex items-start gap-2">
            {missing.length > 0 ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-text" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-text" />
            )}
            <div className="space-y-2">
              <p className={missing.length > 0 ? "font-medium text-warning-text" : "font-medium text-success-text"}>
                {inv.orderNumber ?? "The proforma invoice"} left out {enforced.length === 1 ? "a section" : "some sections"}, so
                this invoice must include {enforced.length === 1 ? "it" : "them"}
                {inv.status === "draft" ? " before it can be issued." : "."}
              </p>
              <ul className="space-y-1">
                {enforced.map((section) => {
                  const gap = missing.find((m) => m.section === section);
                  return (
                    <li key={section} className="flex items-center gap-2">
                      <Lock className="size-3 text-text-muted" />
                      <span className="font-medium">{SECTION_TITLES[section]}</span>
                      <span className="text-text-secondary">— {ENFORCED_SECTION_FIELDS[section].label}</span>
                      {gap ? (
                        <span className="text-xs font-medium text-warning-text">missing</span>
                      ) : (
                        <span className="text-xs font-medium text-success-text">done</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {PARTIES.map((party) => (
          <Card key={party.key}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{party.title}</CardTitle>
                {editable && party.key !== "consignee" && (
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-text-muted">
                    Same as consignee
                    <Switch
                      size="sm"
                      checked={sameAs[party.key]}
                      onCheckedChange={(on) => setSameAs((prev) => ({ ...prev, [party.key]: on }))}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-text-muted">{party.hint}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {party.fields.map(([name, label]) =>
                editable ? (
                  <PartyInput
                    key={name}
                    name={name}
                    label={label}
                    register={register}
                    readOnly={mirrored(name)}
                    required={name === "consigneeName"}
                    error={
                      formState.errors[name]?.message ??
                      (name === "consigneeName" &&
                      consigneeMissing &&
                      (formState.dirtyFields.consigneeName || formState.touchedFields.consigneeName)
                        ? "Consignee name is required before issuing"
                        : undefined)
                    }
                  />
                ) : (
                  <div key={name}>
                    <div className="text-xs font-medium text-text-secondary">{label}</div>
                    <div className="text-sm whitespace-pre-wrap">{inv[name as keyof Invoice] as string | null ?? "—"}</div>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
          <p className="text-xs text-text-muted">Exact copy of the order. MFD/EXP come from the assigned batch.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-xs text-text-secondary">
              <tr className="border-b">
                <th className="py-2 pr-3 text-left font-medium">#</th>
                <th className="py-2 pr-3 text-left font-medium">Product</th>
                <th className="py-2 pr-3 text-left font-medium">MNF</th>
                <th className="py-2 pr-3 text-left font-medium">Batch</th>
                <th className="py-2 pr-3 text-left font-medium">MFD</th>
                <th className="py-2 pr-3 text-left font-medium">EXP</th>
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 pr-3 text-right font-medium" title="Internal — not printed">
                  Cost (LKR)
                </th>
                <th className="py-2 pr-3 text-right font-medium">Unit price</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((item, i) => (
                <tr key={item.id} className="border-t">
                  <td className="py-2 pr-3 font-mono text-xs text-text-muted">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{item.brandName}</div>
                    {item.genericName && <div className="text-xs text-text-secondary">{item.genericName}</div>}
                  </td>
                  <td className="py-2 pr-3 text-text-secondary">{item.manufacturerName ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{item.batchNumber ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{monYY(item.mfd)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{monYY(item.exp)}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {item.quantity.toLocaleString()} {item.unit}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-text-muted">
                    {item.supplierPriceLkr === null ? "—" : item.supplierPriceLkr.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">{formatUsd(item.sellingPriceUsd)}</td>
                  <td className="py-2 text-right font-mono">{formatUsd(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <p className="max-w-md text-sm text-text-secondary italic">
              {inv.amountInWords ?? usdAmountInWords(toCents(inv.totalAmountUsd))}
            </p>
            <div className="w-full max-w-sm space-y-1 rounded-lg border bg-muted/30 p-4 text-sm">
              <TotalRow label={TOTAL_LABELS.subTotal} value={goods} />
              <TotalRow label={TOTAL_LABELS.charges} value={inv.airFreight + inv.handlingDocumentation} />
              <TotalRow label={cnfTotalLabel(inv.cnfDestination)} value={inv.totalAmountUsd} strong />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipping & terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["cnfDestination", "C&F destination"],
                ["paymentTerms", "Payment terms"],
                ["marks", "Marks"],
              ] as const
            ).map(([name, label]) =>
              editable ? (
                <PartyInput
                  key={name}
                  name={name}
                  label={label}
                  register={register}
                  error={formState.errors[name]?.message}
                  required={isEnforcedField(name)}
                />
              ) : (
                <div key={name}>
                  <div className="text-xs font-medium text-text-secondary">{label}</div>
                  <div className="text-sm">{inv[name] ?? "—"}</div>
                </div>
              ),
            )}
            <div className="sm:col-span-2">
              {editable ? (
                <FormField label="Notes" htmlFor="notes" error={formState.errors.notes?.message}>
                  <Textarea id="notes" rows={3} {...register("notes")} />
                </FormField>
              ) : (
                <>
                  <div className="text-xs font-medium text-text-secondary">Notes</div>
                  <div className="text-sm whitespace-pre-wrap">{inv.notes ?? "—"}</div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bank & signature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editable ? (
              <FormField
                label="Bank account"
                htmlFor="bankDetailId"
                error={formState.errors.bankDetailId?.message}
                required={isEnforcedField("bankDetailId")}
              >
                <Controller
                  control={control}
                  name="bankDetailId"
                  render={({ field }) => (
                    <EntityCombobox
                      id="bankDetailId"
                      value={field.value}
                      onChange={field.onChange}
                      options={(banks.data?.data ?? []).map((b) => ({ value: b.id, label: b.bankName, hint: b.accountNumber }))}
                      placeholder="No bank details"
                      noneLabel="— No bank details —"
                    />
                  )}
                />
              </FormField>
            ) : (
              <div className="text-sm">
                <div className="text-xs font-medium text-text-secondary">Bank account</div>
                {inv.bank ? `${inv.bank.bankName} · ${inv.bank.accountNumber}` : "—"}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-medium text-text-secondary">E-signature (printed bottom-right)</div>
              {inv.signature && (!editable || formState.dirtyFields.signatureId === undefined) && (
                <div className="flex items-center gap-3 rounded-lg border bg-paper p-2">
                  {inv.signature.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                    <img src={inv.signature.url} alt={inv.signature.label} className="max-h-14 max-w-32 object-contain" />
                  )}
                  <span className="text-sm">Current: {inv.signature.label}</span>
                </div>
              )}
              {editable ? (
                <Controller
                  control={control}
                  name="signatureId"
                  render={({ field }) => <SignaturePicker value={field.value} onChange={(v) => field.onChange(v)} />}
                />
              ) : (
                !inv.signature && <div className="text-sm text-text-secondary">No signature.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function PartyInput({
  name,
  label,
  register,
  error,
  required,
  readOnly,
}: {
  name: keyof InvoiceUpdateInput;
  label: string;
  register: UseFormRegister<InvoiceUpdateInput>;
  error?: string;
  /** Marks a required field (consignee name, section enforcement). */
  required?: boolean;
  /** Mirrored from the consignee ("Same as consignee"): readOnly, not disabled, so the value is still submitted. */
  readOnly?: boolean;
}) {
  const isAddress = name.endsWith("Address");
  const props = {
    id: name,
    readOnly,
    "aria-readonly": readOnly || undefined,
    className: cn(readOnly && "bg-muted/50 text-text-secondary"),
  };
  return (
    <FormField label={label} htmlFor={name} error={error} required={required}>
      {isAddress ? <Textarea rows={2} {...props} {...register(name)} /> : <Input {...props} {...register(name)} />}
    </FormField>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between border-t pt-2 font-semibold" : "flex justify-between"}>
      <span>{label}</span>
      <span className="font-mono">{formatUsd(value)}</span>
    </div>
  );
}
