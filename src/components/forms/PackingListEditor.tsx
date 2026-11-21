"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PdfButtons } from "@/components/shared/PdfButtons";
import { PipelineProgress } from "@/components/shared/PipelineProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-company";
import { usePermissions } from "@/hooks/use-permissions";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { dealFromInvoice } from "@/lib/pipeline";
import { packingListSchema, type PackingListInput } from "@/lib/validations/packing-lists";
import type { InvoiceDetail, PackingListDetail, PackingListSummary } from "@/types/entities";

const optionalNumber = { setValueAs: (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v)) };

function fromInvoice(inv: InvoiceDetail): PackingListInput {
  // One line per product (batches of the same product are packed together by default).
  const seen = new Map<string, string>();
  for (const i of inv.items) {
    if (!seen.has(i.productId)) seen.set(i.productId, [i.brandName, i.unit].filter(Boolean).join(" "));
  }
  return {
    shipmentReference: `AIR SHIPMENT ${inv.invoiceNumber}`,
    totalCartons: "",
    containerInfo: "",
    grossWeightKg: null,
    netWeightKg: null,
    cbm: null,
    marks: inv.marks ?? "",
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date()),
    items: [...seen.values()].map((description) => ({ cartonStart: null, cartonEnd: null, description, packingDetails: "" })),
  };
}

function fromList(pl: PackingListDetail): PackingListInput {
  return {
    shipmentReference: pl.shipmentReference ?? "",
    totalCartons: pl.totalCartons ?? "",
    containerInfo: pl.containerInfo ?? "",
    grossWeightKg: pl.grossWeightKg,
    netWeightKg: pl.netWeightKg,
    cbm: pl.cbm,
    marks: pl.marks ?? "",
    date: pl.date ?? "",
    items: pl.items.map((i) => ({
      cartonStart: i.cartonStart,
      cartonEnd: i.cartonEnd,
      description: i.description ?? "",
      packingDetails: i.packingDetails ?? "",
    })),
  };
}

export function PackingListEditor({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { companyId } = useCompany();

  const invoice = useQuery({
    queryKey: ["invoices", "detail", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/api/invoices/${invoiceId}`),
  });
  const existing = useQuery({
    queryKey: ["packing-lists", "by-invoice", invoiceId],
    queryFn: async () => {
      const list = await api.list<PackingListSummary>("/api/packing-lists", { invoiceId });
      return list.data[0] ? api.get<PackingListDetail>(`/api/packing-lists/${list.data[0].id}`) : null;
    },
  });

  const inv = invoice.data;
  const pl = existing.data ?? null;
  const editable = !!inv && can("manage_packing_lists") && companyId === inv.companyId && inv.status !== "cancelled";

  const form = useForm<PackingListInput>({ resolver: zodResolver(packingListSchema) });
  const { register, control, handleSubmit, reset, formState } = form;
  const { errors } = formState;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    if (!inv || existing.isLoading) return;
    reset(pl ? fromList(pl) : fromInvoice(inv));
  }, [inv, pl, existing.isLoading, reset]);

  const save = useMutation({
    mutationFn: (values: PackingListInput) =>
      pl
        ? api.put<PackingListDetail>(`/api/packing-lists/${pl.id}`, values)
        : api.post<PackingListDetail>("/api/packing-lists", { ...values, invoiceId }),
    onSuccess: (saved) => {
      toast.success(pl ? "Packing list saved" : "Packing list created");
      queryClient.setQueryData(["packing-lists", "by-invoice", invoiceId], saved);
      for (const key of ["packing-lists", "invoices", "orders", "quotations"]) void queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => showError(errorMessage(err), "Could not save packing list"),
  });

  const remove_ = useMutation({
    mutationFn: () => api.del<{ id: string }>(`/api/packing-lists/${pl!.id}`),
    onSuccess: () => {
      toast.success("Packing list deleted");
      queryClient.setQueryData(["packing-lists", "by-invoice", invoiceId], null);
      for (const key of ["packing-lists", "invoices", "orders", "quotations"]) void queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (invoice.isLoading || existing.isLoading) return <Skeleton className="h-96 w-full" />;
  if (invoice.isError || !inv) return <ErrorState error={invoice.error} />;
  if (existing.isError) return <ErrorState error={existing.error} />;

  const itemErrors = errors.items;

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href={`/invoices/${invoiceId}`}>
            <ArrowLeft />
            {inv.invoiceNumber}
          </Link>
        </Button>
        <PageHeader
          title={`Packing list · ${inv.invoiceNumber}`}
          description={
            pl
              ? `${inv.companyName} · Last saved ${new Date(pl.updatedAt).toLocaleString()}`
              : `${inv.companyName} · Not created yet — lines are pre-filled from the invoice.`
          }
          action={
            <>
              {pl && <PdfButtons path={`/api/packing-lists/${pl.id}/pdf`} label="Packing list PDF" />}
              {editable && pl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label="Delete packing list"
                  onClick={async () => {
                    if (await confirmDanger({ title: "Delete this packing list?", text: "It can be created again from the invoice." }))
                      remove_.mutate();
                  }}
                >
                  <Trash2 />
                </Button>
              )}
              {editable && (
                <Button type="submit" disabled={save.isPending || (!!pl && !formState.isDirty)}>
                  {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  {pl ? "Save" : "Create packing list"}
                </Button>
              )}
            </>
          }
        />
      </div>

      {dealFromInvoice(inv) && (
        <PipelineProgress
          here="packing"
          canAct={companyId === inv.companyId}
          deal={{ ...dealFromInvoice(inv)!, packingListId: inv.status === "cancelled" ? null : (pl?.id ?? null) }}
        />
      )}

      <fieldset disabled={!editable} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <FormField label="Shipment reference" htmlFor="shipmentReference" error={errors.shipmentReference?.message} className="md:col-span-2">
              <Input id="shipmentReference" {...register("shipmentReference")} />
            </FormField>
            <FormField label="Date" htmlFor="date" error={errors.date?.message}>
              <Input id="date" type="date" {...register("date")} />
            </FormField>
            <FormField label="Marks" htmlFor="marks" error={errors.marks?.message}>
              <Input id="marks" placeholder="e.g. APP/Solomon Islands" {...register("marks")} />
            </FormField>
            <FormField label="Total cartons" htmlFor="totalCartons" error={errors.totalCartons?.message}>
              <Input id="totalCartons" placeholder="e.g. 2800 CTN" {...register("totalCartons")} />
            </FormField>
            <FormField label="Container info" htmlFor="containerInfo" error={errors.containerInfo?.message} className="md:col-span-3">
              <Input id="containerInfo" placeholder="e.g. Stuffed in 40HQ - Container (Full container)" {...register("containerInfo")} />
            </FormField>
            <FormField label="Gross weight (kg)" htmlFor="grossWeightKg" error={errors.grossWeightKg?.message}>
              <Input id="grossWeightKg" type="number" min={0} step="0.01" className="font-mono" {...register("grossWeightKg", optionalNumber)} />
            </FormField>
            <FormField label="Net weight (kg)" htmlFor="netWeightKg" error={errors.netWeightKg?.message}>
              <Input id="netWeightKg" type="number" min={0} step="0.01" className="font-mono" {...register("netWeightKg", optionalNumber)} />
            </FormField>
            <FormField label="CBM" htmlFor="cbm" error={errors.cbm?.message}>
              <Input id="cbm" type="number" min={0} step="0.01" className="font-mono" {...register("cbm", optionalNumber)} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cartons</CardTitle>
            <p className="text-xs text-text-muted">
              Packing details is free text describing how items are packed, e.g. <span className="font-mono">(10X1)X10CTN=100 CTN</span>.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <table className="w-full text-sm">
              <thead className="text-xs text-text-secondary">
                <tr className="border-b">
                  <th className="w-24 py-2 pr-2 text-left font-medium">From CTN</th>
                  <th className="w-24 py-2 pr-2 text-left font-medium">To CTN</th>
                  <th className="py-2 pr-2 text-left font-medium">Description of item</th>
                  <th className="w-64 py-2 pr-2 text-left font-medium">Packing details</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const err = Array.isArray(itemErrors) ? itemErrors[index] : undefined;
                  return (
                    <tr key={field.id} className="align-top">
                      <td className="py-1.5 pr-2">
                        <Input type="number" min={1} className="font-mono" aria-label="From carton" {...register(`items.${index}.cartonStart`, optionalNumber)} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input type="number" min={1} className="font-mono" aria-label="To carton" aria-invalid={!!err?.cartonEnd || undefined} {...register(`items.${index}.cartonEnd`, optionalNumber)} />
                        {err?.cartonEnd && <p className="mt-1 text-xs text-destructive">{err.cartonEnd.message}</p>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input aria-label="Description" aria-invalid={!!err?.description || undefined} {...register(`items.${index}.description`)} />
                        {err?.description && <p className="mt-1 text-xs text-destructive">{err.description.message}</p>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input className="font-mono" placeholder="(10X1)X10CTN=100 CTN" aria-label="Packing details" {...register(`items.${index}.packingDetails`)} />
                      </td>
                      <td className="py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Remove line ${index + 1}`}
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!Array.isArray(itemErrors) && itemErrors?.message && <p className="text-sm text-destructive">{itemErrors.message}</p>}
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ cartonStart: null, cartonEnd: null, description: "", packingDetails: "" })}
            >
              <Plus />
              Add line
            </Button>
          </CardContent>
        </Card>
      </fieldset>
    </form>
  );
}
