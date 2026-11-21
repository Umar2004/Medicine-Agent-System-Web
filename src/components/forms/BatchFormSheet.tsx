"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { MonthYearInput } from "@/components/forms/MonthYearInput";
import { EntityCombobox } from "@/components/shared/EntityCombobox";
import { FormSheet } from "@/components/shared/FormSheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { confirmAction, showError, showWarning } from "@/lib/alerts";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { batchSchema, type BatchInput } from "@/lib/validations/batches";
import type { Batch, BatchDetail, Product, SupplierOption } from "@/types/entities";

const NO_PRICE_TYPE = "__none__";

function toFormValues(batch: Batch | null | undefined, productId?: string): BatchInput {
  return {
    productId: batch?.productId ?? productId ?? "",
    batchNumber: batch?.batchNumber ?? "",
    mfd: batch?.mfd ?? "",
    exp: batch?.exp ?? "",
    stockQuantity: batch?.stockQuantity ?? 0,
    supplierId: batch?.supplierId ?? "",
    costPrice: batch?.costPrice ?? null,
    priceType: batch?.priceType ?? "",
    isActive: batch?.isActive ?? true,
  };
}

export function BatchFormSheet({
  open,
  onOpenChange,
  batch,
  productId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  batch?: Batch | null;
  /** Pre-selects (and locks) the product, e.g. from the product page. */
  productId?: string;
}) {
  const isEdit = !!batch;
  const queryClient = useQueryClient();
  const { register, handleSubmit, control, reset, formState } = useForm<BatchInput>({
    resolver: zodResolver(batchSchema),
    defaultValues: toFormValues(batch, productId),
  });
  const { errors } = formState;

  useEffect(() => {
    if (open) reset(toFormValues(batch, productId));
  }, [open, batch, productId, reset]);

  const products = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.list<Product>("/api/products", { pageSize: 200, sortBy: "brandName" }),
    enabled: open,
    staleTime: 60_000,
  });
  const suppliers = useQuery({
    queryKey: ["suppliers", "options"],
    queryFn: () => api.get<SupplierOption[]>("/api/suppliers/options"),
    enabled: open,
    staleTime: 60_000,
  });
  // Usage decides whether stock edits need an extra warning and whether the product is locked.
  const detail = useQuery({
    queryKey: ["batches", "detail", batch?.id],
    queryFn: () => api.get<BatchDetail>(`/api/batches/${batch!.id}`),
    enabled: open && isEdit,
  });
  const used = (detail.data?.usage.orders ?? 0) + (detail.data?.usage.invoices ?? 0);

  const productOptions = useMemo(
    () =>
      (products.data?.data ?? []).map((p) => ({
        value: p.id,
        label: p.brandName,
        hint: [p.unit, p.productNumber].filter(Boolean).join(" · "),
      })),
    [products.data],
  );
  const supplierOptions = useMemo(
    () => (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.companyName })),
    [suppliers.data],
  );

  const save = useMutation({
    mutationFn: (values: BatchInput) =>
      isEdit ? api.put<Batch>(`/api/batches/${batch.id}`, values) : api.post<Batch>("/api/batches", values),
    onSuccess: (saved) => {
      toast.success(isEdit ? `Batch ${saved.batchNumber} updated` : `Batch ${saved.batchNumber} added`);
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.status === 409) showWarning(err.message, "Cannot save batch");
      else showError(errorMessage(err));
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    // CLAUDE.md §7.6: stock edits are confirmed (and audited server-side).
    if (isEdit && values.stockQuantity !== batch.stockQuantity) {
      const confirmed = await confirmAction({
        title: "Change stock quantity?",
        text:
          `Stock for batch ${batch.batchNumber} changes from ${batch.stockQuantity.toLocaleString()} to ` +
          `${values.stockQuantity.toLocaleString()}.` +
          (used > 0 ? ` This batch is already used in ${used} order(s)/invoice(s).` : "") +
          " The change is recorded in the audit log.",
        confirmText: "Update stock",
      });
      if (!confirmed) return;
    }
    save.mutate(values);
  });

  const lockProduct = !!productId || (isEdit && used > 0);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit batch ${batch.batchNumber}` : "Receive stock — new batch"}
      description="Batches are shared by all companies. Cost price is what the company paid (LKR)."
      formId="batch-form"
      onSubmit={onSubmit}
      submitLabel={isEdit ? "Save changes" : "Add batch"}
      isPending={save.isPending}
    >
      <FormField
        label="Product"
        htmlFor="productId"
        error={errors.productId?.message}
        hint={isEdit && used > 0 ? "Locked — this batch is already used in orders." : undefined}
        required
      >
        <Controller
          control={control}
          name="productId"
          render={({ field }) => (
            <EntityCombobox
              id="productId"
              value={field.value}
              onChange={field.onChange}
              options={productOptions}
              placeholder={products.isLoading ? "Loading products…" : "Select product"}
              searchPlaceholder="Search products…"
              disabled={lockProduct || products.isLoading}
              invalid={!!errors.productId}
            />
          )}
        />
      </FormField>

      <FormField
        label="Batch number"
        htmlFor="batchNumber"
        error={errors.batchNumber?.message}
        hint="Must be unique for this product."
        required
      >
        <Input id="batchNumber" className="font-mono" autoFocus={!isEdit} {...register("batchNumber")} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="MFD" htmlFor="mfd" error={errors.mfd?.message} required>
          <Controller
            control={control}
            name="mfd"
            render={({ field }) => (
              <MonthYearInput id="mfd" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.mfd} />
            )}
          />
        </FormField>
        <FormField label="EXP" htmlFor="exp" error={errors.exp?.message} required>
          <Controller
            control={control}
            name="exp"
            render={({ field }) => (
              <MonthYearInput id="exp" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.exp} />
            )}
          />
        </FormField>
      </div>

      <FormField
        label="Stock quantity"
        htmlFor="stockQuantity"
        error={errors.stockQuantity?.message}
        hint={isEdit && used > 0 ? `Used in ${used} order(s)/invoice(s) — quantities already assigned were deducted.` : undefined}
        required
      >
        <Input
          id="stockQuantity"
          type="number"
          min={0}
          step={1}
          className="font-mono"
          {...register("stockQuantity", { valueAsNumber: true })}
        />
      </FormField>

      <FormField label="Supplier" htmlFor="supplierId" error={errors.supplierId?.message}>
        <Controller
          control={control}
          name="supplierId"
          render={({ field }) => (
            <EntityCombobox
              id="supplierId"
              value={field.value}
              onChange={field.onChange}
              options={supplierOptions}
              placeholder={suppliers.isLoading ? "Loading suppliers…" : "Select supplier"}
              searchPlaceholder="Search suppliers…"
              noneLabel="— No supplier —"
              disabled={suppliers.isLoading}
            />
          )}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Cost price (LKR)" htmlFor="costPrice" error={errors.costPrice?.message}>
          <Input
            id="costPrice"
            type="number"
            min={0}
            step="0.01"
            className="font-mono"
            {...register("costPrice", { setValueAs: (v: unknown) => (v === "" || v === null ? null : Number(v)) })}
          />
        </FormField>
        <FormField label="Price type" htmlFor="priceType" error={errors.priceType?.message}>
          <Controller
            control={control}
            name="priceType"
            render={({ field }) => (
              <Select
                value={field.value || NO_PRICE_TYPE}
                onValueChange={(v) => field.onChange(v === NO_PRICE_TYPE ? "" : v)}
              >
                <SelectTrigger id="priceType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PRICE_TYPE}>— Not set —</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>

      <Controller
        control={control}
        name="isActive"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="isActive" className="text-[13px] font-medium">
                Active
              </Label>
              <p className="text-xs text-text-muted">
                Inactive batches (quality issue, recall) are hidden from batch assignment. Expired batches are made
                inactive automatically.
              </p>
            </div>
            <Switch id="isActive" checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
    </FormSheet>
  );
}
