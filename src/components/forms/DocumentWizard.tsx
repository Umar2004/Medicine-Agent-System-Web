"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, History, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { QuotationItemsEditor } from "@/components/forms/QuotationItemsEditor";
import { EntityCombobox } from "@/components/shared/EntityCombobox";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionToggle } from "@/components/shared/SectionToggle";
import { SelectCompanyNotice } from "@/components/shared/SelectCompanyNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/hooks/use-company";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { formatUsd, monYY } from "@/lib/format";
import { lineTotalCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { cnfTotalLabel, SHIPPING_MODE, TOTAL_LABELS } from "@/lib/constants";
import { createProformaSchema } from "@/lib/validations/orders";
import { createQuotationSchema, type QuotationCreateInput } from "@/lib/validations/quotations";
import type { BankAccount, Customer, Product, ProductOption } from "@/types/entities";

/** Form values for a quotation or PI — both schemas have the same shape. */
export type DocumentFormValues = QuotationCreateInput;
export type DocumentMode = "quotation" | "proforma";

const MODES = {
  quotation: {
    label: "quotation",
    title: "Quotation",
    newTitle: "New quotation",
    listLabel: "Quotations",
    listHref: "/quotations",
    href: (id: string) => `/quotations/${id}`,
    apiBase: "/api/quotations",
    nextNumberPath: "/api/quotations/next-number",
    queryKey: "quotations",
    schema: createQuotationSchema,
    sectionsDefault: false,
    sectionsHint: "All optional — quotations leave these out unless you switch them on.",
  },
  proforma: {
    label: "proforma invoice",
    title: "Proforma invoice",
    newTitle: "New proforma invoice",
    listLabel: "Orders",
    listHref: "/orders",
    href: (id: string) => `/orders/${id}`,
    apiBase: "/api/orders",
    nextNumberPath: "/api/orders/next-number",
    queryKey: "orders",
    schema: createProformaSchema,
    sectionsDefault: true,
    sectionsHint:
      "Included by default on proforma invoices. Any section you switch off must be completed on the invoice.",
  },
} as const;

const STEPS = ["Customer", "Products", "Sections", "PDF options", "Preview"] as const;

const FREIGHT_FIELDS = ["airFreight", "handlingDocumentation", "cnfDestination"] as const;
const BANK_FIELDS = ["bankDetailId"] as const;
const OTHER_FIELDS = ["paymentTerms", "marks", "notes"] as const;
const SECTIONS = [
  { toggle: "showFreight", fields: FREIGHT_FIELDS },
  { toggle: "showBankDetails", fields: BANK_FIELDS },
  { toggle: "showOtherDetails", fields: OTHER_FIELDS },
] as const;

/** Fields validated before leaving each step. */
const STEP_FIELDS: FieldPath<DocumentFormValues>[][] = [
  ["customerId"],
  ["items"],
  ["showFreight", "showBankDetails", "showOtherDetails", ...FREIGHT_FIELDS, ...BANK_FIELDS, ...OTHER_FIELDS],
  ["showMfd", "showExp", "showGenericName"],
  [],
];

/** An existing document being edited. */
export interface ExistingDocument {
  id: string;
  number: string;
  companyName: string;
  status: string;
  revisionNumber: number;
  values: DocumentFormValues;
  products: ProductOption[];
}

function blankValues(sectionsOn: boolean): DocumentFormValues {
  return {
    customerId: "",
    items: [],
    airFreight: 0,
    handlingDocumentation: 0,
    cnfDestination: "",
    marks: "",
    paymentTerms: "",
    notes: "",
    bankDetailId: "",
    showMfd: true,
    showExp: true,
    showGenericName: true,
    showFreight: sectionsOn,
    showBankDetails: sectionsOn,
    showOtherDetails: sectionsOn,
  };
}

/** What saving an edit does, by status (mirrors the API's revision rules). */
function editNote(existing: ExistingDocument): string {
  const next = existing.revisionNumber + 1;
  switch (existing.status) {
    case "sent":
    case "negotiating":
      return `Saving creates revision ${next} and marks it as negotiating.`;
    case "confirmed":
      return `Saving creates revision ${next}, voids the customer's confirmation and moves it back to negotiating — send it again for the customer to re-confirm.`;
    case "accepted":
      return `Saving creates revision ${next} and moves it back to negotiating — send it again for the customer to re-accept.`;
    case "rejected":
      return `Saving starts revision ${next} as a draft.`;
    default:
      return `Draft — changes update revision ${existing.revisionNumber}.`;
  }
}

/**
 * Create/edit wizard shared by quotations (`mode="quotation"`, sections OFF by default) and
 * proforma invoices (`mode="proforma"`, sections ON by default). No batches are chosen here.
 */
export function DocumentWizard({ mode, existing }: { mode: DocumentMode; existing?: ExistingDocument }) {
  const cfg = MODES[mode];
  const isEdit = !!existing;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { companyId, isAllCompanies, currentCompany } = useCompany();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(isEdit ? STEPS.length - 1 : 0);

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(cfg.schema),
    defaultValues: existing?.values ?? blankValues(cfg.sectionsDefault),
    mode: "onTouched",
  });
  const { control, register, setValue, getValues, trigger, handleSubmit, formState } = form;
  const { errors } = formState;
  const values = useWatch({ control }) as DocumentFormValues;

  const enabled = !!companyId;
  const customers = useQuery({
    queryKey: ["customers", companyId, "options"],
    queryFn: () => api.list<Customer>("/api/customers", { pageSize: 200, sortBy: "name" }),
    enabled,
    staleTime: 60_000,
  });
  const banks = useQuery({
    queryKey: ["bank-details", companyId, "options"],
    queryFn: () => api.list<BankAccount>("/api/bank-details", { pageSize: 200 }),
    enabled,
    staleTime: 60_000,
  });
  const products = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.list<Product>("/api/products", { pageSize: 200, sortBy: "brandName" }),
    staleTime: 60_000,
  });
  // The number contains the customer code, so it can only be previewed once a customer is picked.
  const nextNumber = useQuery({
    queryKey: [cfg.queryKey, companyId, "next-number", values.customerId],
    queryFn: () =>
      api.get<{ quotationNumber?: string; orderNumber?: string }>(cfg.nextNumberPath, { customerId: values.customerId }),
    enabled: enabled && !isEdit && !!values.customerId,
  });
  const previewNumber = nextNumber.data?.quotationNumber ?? nextNumber.data?.orderNumber;

  const customerOptions = useMemo(
    () =>
      (customers.data?.data ?? []).map((c) => ({
        value: c.id,
        label: c.businessName || c.name,
        hint: `${c.code}${c.country ? ` · ${c.country}` : ""}`,
      })),
    [customers.data],
  );
  const selectedCustomer = customers.data?.data.find((c) => c.id === values.customerId);
  // Lines can reference products outside the cached list (edit mode, or picked via server search).
  const [remembered, setRemembered] = useState<ProductOption[]>(() => existing?.products ?? []);
  const productById = useMemo(() => {
    const map = new Map<string, ProductOption>(remembered.map((p) => [p.id, p]));
    for (const p of products.data?.data ?? []) map.set(p.id, p);
    return map;
  }, [remembered, products.data]);
  const rememberProduct = useCallback(
    (p: ProductOption) => setRemembered((list) => (list.some((x) => x.id === p.id) ? list : [...list, p])),
    [],
  );
  const selectedBank = banks.data?.data.find((b) => b.id === values.bankDetailId);

  const goodsCents = (values.items ?? []).reduce(
    (s, i) => s + lineTotalCents(Number(i?.quantity) || 0, Number(i?.sellingPriceUsd) || 0),
    0,
  );
  // Matches the API: freight only counts toward C&F while its section is on.
  const freightCents = values.showFreight
    ? toCents(Number(values.airFreight) || 0) + toCents(Number(values.handlingDocumentation) || 0)
    : 0;
  const cnfCents = goodsCents + freightCents;

  const save = useMutation({
    mutationFn: (input: DocumentFormValues) =>
      isEdit
        ? api.put<{ id: string; quotationNumber?: string; orderNumber?: string }>(`${cfg.apiBase}/${existing.id}`, input)
        : api.post<{ id: string; quotationNumber?: string; orderNumber?: string }>(cfg.apiBase, input),
    onSuccess: (saved) => {
      const number = saved.quotationNumber ?? saved.orderNumber ?? "";
      toast.success(isEdit ? `${number} updated` : `${cfg.title} ${number} created`);
      void queryClient.invalidateQueries({ queryKey: [cfg.queryKey] });
      void queryClient.invalidateQueries({ queryKey: ["last-price"] });
      void queryClient.invalidateQueries({ queryKey: ["revisions"] });
      router.push(cfg.href(saved.id));
    },
    onError: (err) => showError(errorMessage(err), `Could not save ${cfg.label}`),
  });

  // Guards against a double click creating two records before `isPending` re-renders the button.
  const savingRef = useRef(false);
  function saveExplicitly() {
    if (step !== STEPS.length - 1 || savingRef.current || save.isPending) return;
    savingRef.current = true;
    void handleSubmit(
      // Stays locked after success (the page navigates to the saved document); unlocks on error.
      (v) => save.mutate(v, { onError: () => (savingRef.current = false) }),
      () => (savingRef.current = false),
    )();
  }

  async function goTo(target: number) {
    if (target > step) {
      for (let s = step; s < target; s++) {
        const valid = await trigger(STEP_FIELDS[s]);
        if (!valid) {
          if (s === STEPS.indexOf("Products") && getValues("items").length > 0) {
            toast.error("Please fill in price, quantity, MFD and EXP for all products before proceeding.");
          }
          // An error inside a switched-off section would be invisible — switch it back on.
          for (const { toggle, fields } of SECTIONS) {
            if (fields.some((f) => form.getFieldState(f).error)) setValue(toggle, true, { shouldDirty: true });
          }
          setStep(s);
          return;
        }
      }
    }
    setStep(target);
    setFurthest((f) => Math.max(f, target));
  }

  if (isAllCompanies) {
    return (
      <div className="space-y-6">
        <PageHeader title={cfg.newTitle} />
        <SelectCompanyNotice what={`${cfg.label}s`} />
      </div>
    );
  }

  const sectionToggle = (
    name: "showFreight" | "showBankDetails" | "showOtherDetails",
    label: string,
    description: string,
    children: ReactNode,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SectionToggle label={label} description={description} enabled={field.value} onChange={field.onChange}>
          {children}
        </SectionToggle>
      )}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href={isEdit ? cfg.href(existing.id) : cfg.listHref}>
            <ArrowLeft />
            {isEdit ? existing.number : cfg.listLabel}
          </Link>
        </Button>
        <PageHeader
          title={isEdit ? `Edit ${existing.number}` : cfg.newTitle}
          description={
            isEdit
              ? `${existing.companyName} · Revision ${existing.revisionNumber}`
              : `${currentCompany?.name ?? ""} · ${
                  previewNumber ? `Will be saved as ${previewNumber}` : "The number is based on the customer's code"
                }`
          }
        />
        {isEdit && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-text-secondary">
            <History className="size-4 text-text-muted" />
            {editNote(existing)}
          </p>
        )}
      </div>

      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void goTo(i)}
              disabled={i > furthest + 1}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                i === step && "border-primary bg-primary text-primary-foreground",
                i < step && "border-primary/40 bg-primary-light text-primary",
                i > step && "text-text-secondary hover:bg-muted disabled:opacity-50",
              )}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-background/20 font-mono text-xs">
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" />}
          </li>
        ))}
      </ol>

      <form
        // Never save on a native submit: the record is created/updated only by the explicit
        // Create / Save button on the Preview step (see saveExplicitly).
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Enter in an input must not submit the wizard early.
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
        }}
        noValidate
      >
        {/* The products step has a sticky side panel, which overflow-hidden would break. */}
        <Card className={cn(step === 1 && "overflow-visible")}>
          <CardContent className="pt-6">
            {step === 0 && (
              <div className="max-w-xl space-y-4">
                <FormField
                  label="Customer"
                  htmlFor="customerId"
                  error={errors.customerId?.message}
                  hint={isEdit ? "The customer can't be changed — its code is part of the number." : undefined}
                  required
                >
                  <Controller
                    control={control}
                    name="customerId"
                    render={({ field }) => (
                      <EntityCombobox
                        id="customerId"
                        value={field.value}
                        onChange={field.onChange}
                        options={customerOptions}
                        placeholder={customers.isLoading ? "Loading customers…" : "Select customer"}
                        searchPlaceholder="Search customers…"
                        emptyText="No customers. Add one on the Customers page."
                        invalid={!!errors.customerId}
                        disabled={isEdit}
                      />
                    )}
                  />
                </FormField>
                {selectedCustomer && (
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                    <div className="font-medium">{selectedCustomer.businessName || selectedCustomer.name}</div>
                    {selectedCustomer.businessName && <div className="text-text-secondary">{selectedCustomer.name}</div>}
                    <div className="mt-2 grid gap-1 text-xs text-text-secondary">
                      <span>
                        {selectedCustomer.customerNumber} · Code <span className="font-mono">{selectedCustomer.code}</span>
                      </span>
                      {[selectedCustomer.address, selectedCustomer.city, selectedCustomer.country].filter(Boolean).join(", ")}
                      {selectedCustomer.phone && <span>{selectedCustomer.phone}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Enter MFD/EXP as quoted to the customer. Batches are assigned later by the warehouse. Prices load from
                  this customer&apos;s last quotation or proforma invoice when available.
                </p>
                <QuotationItemsEditor
                  control={control}
                  register={register}
                  setValue={setValue}
                  getValues={getValues}
                  errors={errors}
                  customerId={values.customerId}
                  productById={productById}
                  onRememberProduct={rememberProduct}
                  documentLabel={cfg.label}
                />
              </div>
            )}

            {step === 2 && (
              <div className="max-w-3xl space-y-4">
                <p className="text-sm text-text-secondary">{cfg.sectionsHint}</p>
                {sectionToggle(
                  "showFreight",
                  "Freight & C&F",
                  "Air freight, handling & documentation, C&F destination and shipping type.",
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Air freight (USD)" htmlFor="airFreight" error={errors.airFreight?.message}>
                      <Input
                        id="airFreight"
                        type="number"
                        min={0}
                        step="0.01"
                        className="font-mono"
                        {...register("airFreight", { valueAsNumber: true })}
                      />
                    </FormField>
                    <FormField
                      label="Handling & documentation (USD)"
                      htmlFor="handlingDocumentation"
                      error={errors.handlingDocumentation?.message}
                    >
                      <Input
                        id="handlingDocumentation"
                        type="number"
                        min={0}
                        step="0.01"
                        className="font-mono"
                        {...register("handlingDocumentation", { valueAsNumber: true })}
                      />
                    </FormField>
                    <FormField label="C&F destination" htmlFor="cnfDestination" error={errors.cnfDestination?.message}>
                      <Input id="cnfDestination" placeholder="e.g. Nairobi" {...register("cnfDestination")} />
                    </FormField>
                  </div>,
                )}
                {sectionToggle(
                  "showBankDetails",
                  "Bank details",
                  "The bank account the customer pays into.",
                  <FormField
                    label="Bank account"
                    htmlFor="bankDetailId"
                    error={errors.bankDetailId?.message}
                    hint={
                      banks.data?.totalCount === 0
                        ? "No bank accounts for this company yet — add one under Bank Accounts."
                        : undefined
                    }
                  >
                    <Controller
                      control={control}
                      name="bankDetailId"
                      render={({ field }) => (
                        <EntityCombobox
                          id="bankDetailId"
                          value={field.value}
                          onChange={field.onChange}
                          options={(banks.data?.data ?? []).map((b) => ({
                            value: b.id,
                            label: b.bankName,
                            hint: b.accountNumber,
                          }))}
                          placeholder="Select bank account"
                          noneLabel="— No bank account —"
                        />
                      )}
                    />
                  </FormField>,
                )}
                {sectionToggle(
                  "showOtherDetails",
                  "Notes & other details",
                  "Payment terms, marks and notes.",
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Payment terms" htmlFor="paymentTerms" error={errors.paymentTerms?.message}>
                      <Input id="paymentTerms" placeholder="e.g. 100% advance" {...register("paymentTerms")} />
                    </FormField>
                    <FormField label="Marks" htmlFor="marks" error={errors.marks?.message}>
                      <Input id="marks" {...register("marks")} />
                    </FormField>
                    <FormField label="Notes" htmlFor="notes" error={errors.notes?.message} className="md:col-span-2">
                      <Textarea id="notes" rows={3} {...register("notes")} />
                    </FormField>
                  </div>,
                )}
                <Totals goodsCents={goodsCents} values={values} cnfCents={cnfCents} className="ml-auto max-w-sm" />
              </div>
            )}

            {step === 3 && (
              <div className="max-w-xl space-y-4">
                {(
                  [
                    ["showGenericName", "Show generic name", "Print the generic name under each product."],
                    ["showMfd", "Show MFD", "Print the manufacturing date column."],
                    ["showExp", "Show EXP", "Print the expiry date column."],
                  ] as const
                ).map(([name, label, hint]) => (
                  <Controller
                    key={name}
                    control={control}
                    name={name}
                    render={({ field }) => (
                      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                        <div>
                          <Label htmlFor={name} className="text-[13px] font-medium">
                            {label}
                          </Label>
                          <p className="text-xs text-text-muted">{hint}</p>
                        </div>
                        <Switch id={name} checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    )}
                  />
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <PreviewBlock title="Customer">
                    <div className="font-medium">{selectedCustomer?.businessName || selectedCustomer?.name}</div>
                    <div className="text-text-secondary">
                      {[selectedCustomer?.address, selectedCustomer?.city, selectedCustomer?.country].filter(Boolean).join(", ")}
                    </div>
                  </PreviewBlock>
                  <PreviewBlock title="Freight & C&F">
                    {values.showFreight ? (
                      <>
                        <div>C&F {values.cnfDestination || "—"}</div>
                        <div className="text-text-secondary">{SHIPPING_MODE}</div>
                      </>
                    ) : (
                      <NotIncluded />
                    )}
                  </PreviewBlock>
                  <PreviewBlock title="Bank & print options">
                    {values.showBankDetails ? (
                      <div>{selectedBank ? `${selectedBank.bankName} · ${selectedBank.accountNumber}` : "No bank account selected"}</div>
                    ) : (
                      <NotIncluded />
                    )}
                    <div className="text-text-secondary">
                      {[values.showGenericName && "Generic name", values.showMfd && "MFD", values.showExp && "EXP"]
                        .filter(Boolean)
                        .join(", ") || "No optional columns"}
                    </div>
                  </PreviewBlock>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs text-text-secondary">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">Product</th>
                        <th className="px-3 py-2 text-left font-medium">MNF</th>
                        {values.showMfd && <th className="px-3 py-2 text-left font-medium">MFD</th>}
                        {values.showExp && <th className="px-3 py-2 text-left font-medium">EXP</th>}
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Unit price</th>
                        <th className="px-3 py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(values.items ?? []).map((item, i) => {
                        const p = productById.get(item.productId);
                        return (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs text-text-muted">{i + 1}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{p?.brandName ?? "—"}</div>
                              {values.showGenericName && p?.genericName && (
                                <div className="text-xs text-text-secondary">{p.genericName}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-text-secondary">{p?.manufacturerName ?? "—"}</td>
                            {values.showMfd && <td className="px-3 py-2 font-mono text-xs">{monYY(item.mfd)}</td>}
                            {values.showExp && <td className="px-3 py-2 font-mono text-xs">{monYY(item.exp)}</td>}
                            <td className="px-3 py-2 text-right font-mono">
                              {Number(item.quantity).toLocaleString()} {item.unit}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{formatUsd(item.sellingPriceUsd)}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {formatUsd(lineTotalCents(Number(item.quantity) || 0, Number(item.sellingPriceUsd) || 0) / 100)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Totals goodsCents={goodsCents} values={values} cnfCents={cnfCents} className="ml-auto max-w-sm" />
                {values.showOtherDetails && (values.paymentTerms || values.marks || values.notes) && (
                  <PreviewBlock title="Notes & other details">
                    {values.paymentTerms && <div>Terms: {values.paymentTerms}</div>}
                    {values.marks && <div className="text-text-secondary">Marks: {values.marks}</div>}
                    {values.notes && <p className="whitespace-pre-wrap text-text-secondary">{values.notes}</p>}
                  </PreviewBlock>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-between">
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ArrowLeft />
            Back
          </Button>
          {/* Distinct keys: React must not reuse the Next <button> as the Create button. A real click on
              Next used to land on the same element after it had become type="submit" (step change
              flushed before the browser's default action), which created the record on "Preview". */}
          {step < STEPS.length - 1 ? (
            <Button key="next" type="button" onClick={() => void goTo(step + 1)}>
              Next
              <ArrowRight />
            </Button>
          ) : (
            <Button key="save" type="button" disabled={save.isPending} onClick={saveExplicitly}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {isEdit ? "Save changes" : `Create ${cfg.label}`}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function NotIncluded() {
  return <div className="text-text-muted italic">Not included</div>;
}

function PreviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-xs font-medium tracking-wide text-text-secondary uppercase">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 px-4 text-sm">{children}</CardContent>
    </Card>
  );
}

function Totals({
  goodsCents,
  cnfCents,
  values,
  className,
}: {
  goodsCents: number;
  cnfCents: number;
  values: DocumentFormValues;
  className?: string;
}) {
  const row = (label: string, amount: number, strong?: boolean) => (
    <div className={cn("flex justify-between py-1", strong && "border-t pt-2 font-semibold")}>
      <span>{label}</span>
      <span className="font-mono">{formatUsd(amount)}</span>
    </div>
  );
  return (
    <div className={cn("rounded-lg border bg-muted/30 p-4 text-sm", className)}>
      {row(TOTAL_LABELS.subTotal, goodsCents / 100)}
      {values.showFreight &&
        row(TOTAL_LABELS.charges, (Number(values.airFreight) || 0) + (Number(values.handlingDocumentation) || 0))}
      {row(
        values.showFreight ? cnfTotalLabel(values.cnfDestination) : "Total",
        cnfCents / 100,
        true,
      )}
    </div>
  );
}
