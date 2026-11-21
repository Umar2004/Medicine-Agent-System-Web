"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { showError, showWarning } from "@/lib/alerts";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { manufacturerSchema, type ManufacturerInput } from "@/lib/validations/manufacturers";
import { productSchema, type ProductInput } from "@/lib/validations/products";
import type { Manufacturer, ManufacturerOption, Product } from "@/types/entities";

const NO_MANUFACTURER = "__none__";

const emptyValues: ProductInput = {
  brandName: "",
  genericName: "",
  manufacturerId: "",
  unit: "",
  country: "",
  lowStockThreshold: 100,
};

function toFormValues(product: Product | null | undefined): ProductInput {
  if (!product) return emptyValues;
  return {
    brandName: product.brandName,
    genericName: product.genericName ?? "",
    manufacturerId: product.manufacturerId ?? "",
    unit: product.unit ?? "",
    country: product.country ?? "",
    lowStockThreshold: product.lowStockThreshold,
  };
}

export function ProductFormSheet({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  product?: Product | null;
  onSaved?: (product: Product) => void;
}) {
  const isEdit = !!product;
  const queryClient = useQueryClient();

  const form = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: toFormValues(product),
  });
  const { register, handleSubmit, control, reset, formState } = form;
  const { errors } = formState;

  /* ── Inline quick-add manufacturer ── */
  const [showMfgForm, setShowMfgForm] = useState(false);
  const [mfgName, setMfgName] = useState("");
  const [mfgCountry, setMfgCountry] = useState("");
  const [mfgContact, setMfgContact] = useState("");
  const [mfgErrors, setMfgErrors] = useState<Record<string, string>>({});

  const resetMfgForm = () => {
    setMfgName("");
    setMfgCountry("");
    setMfgContact("");
    setMfgErrors({});
    setShowMfgForm(false);
  };

  useEffect(() => {
    if (open) {
      reset(toFormValues(product));
      resetMfgForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product, reset]);

  const manufacturers = useQuery({
    queryKey: ["manufacturers", "options"],
    queryFn: () => api.list<ManufacturerOption>("/api/manufacturers", { pageSize: 200 }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const createMfg = useMutation({
    mutationFn: (values: ManufacturerInput) => api.post<Manufacturer>("/api/manufacturers", values),
    onSuccess: (saved) => {
      toast.success(`Manufacturer ${saved.manufacturerNumber} created`);
      void queryClient.invalidateQueries({ queryKey: ["manufacturers"] });
      form.setValue("manufacturerId", saved.id);
      resetMfgForm();
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.status === 409) showWarning(err.message, "Duplicate manufacturer");
      else showError(errorMessage(err));
    },
  });

  const handleMfgSubmit = () => {
    const result = manufacturerSchema.safeParse({ name: mfgName, country: mfgCountry, contactInfo: mfgContact });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) fieldErrors[issue.path[0] as string] = issue.message;
      setMfgErrors(fieldErrors);
      return;
    }
    setMfgErrors({});
    createMfg.mutate(result.data);
  };

  const save = useMutation({
    mutationFn: (values: ProductInput) =>
      isEdit ? api.put<Product>(`/api/products/${product.id}`, values) : api.post<Product>("/api/products", values),
    onSuccess: (saved) => {
      toast.success(isEdit ? "Product updated" : `Product ${saved.productNumber} created`);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.status === 409) showWarning(err.message, "Duplicate product");
      else showError(errorMessage(err));
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{isEdit ? `Edit ${product.productNumber}` : "New product"}</SheetTitle>
          <SheetDescription>
            Products are shared by all companies (one warehouse). The product number is generated automatically.
          </SheetDescription>
        </SheetHeader>

        <form
          id="product-form"
          onSubmit={handleSubmit((values) => save.mutate(values))}
          className="flex-1 space-y-4 overflow-y-auto p-4"
          noValidate
        >
          <FormField label="Brand name" htmlFor="brandName" error={errors.brandName?.message} required>
            <Input id="brandName" placeholder="e.g. Crestor 20mg Tablet" autoFocus {...register("brandName")} />
          </FormField>

          <FormField label="Generic name" htmlFor="genericName" error={errors.genericName?.message}>
            <Input id="genericName" placeholder="e.g. Rosuvastatin" {...register("genericName")} />
          </FormField>

          <FormField
            label="Manufacturer"
            htmlFor="manufacturerId"
            error={errors.manufacturerId?.message}
            hint={
              !showMfgForm && manufacturers.data?.totalCount === 0
                ? "No manufacturers yet — use the + button to add one."
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="manufacturerId"
                render={({ field }) => (
                  <Select
                    value={field.value || NO_MANUFACTURER}
                    onValueChange={(v) => field.onChange(v === NO_MANUFACTURER ? "" : v)}
                    disabled={manufacturers.isLoading}
                  >
                    <SelectTrigger id="manufacturerId" className="w-full">
                      <SelectValue placeholder="Select manufacturer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MANUFACTURER}>— None —</SelectItem>
                      {manufacturers.data?.data.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                          {m.country ? ` (${m.country})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Button
                type="button"
                variant={showMfgForm ? "secondary" : "outline"}
                size="icon"
                className="shrink-0"
                onClick={() => setShowMfgForm((prev) => !prev)}
                title={showMfgForm ? "Close quick-add" : "Quick-add manufacturer"}
              >
                {showMfgForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </FormField>

          {showMfgForm && (
            <div className="border-primary/30 bg-primary/5 space-y-3 rounded-lg border-l-4 p-3">
              <p className="text-muted-foreground text-xs font-medium">Quick-add manufacturer</p>
              <FormField label="Name" htmlFor="mfg-name" error={mfgErrors.name} required>
                <Input
                  id="mfg-name"
                  placeholder="e.g. AstraZeneca"
                  value={mfgName}
                  onChange={(e) => setMfgName(e.target.value)}
                />
              </FormField>
              <FormField label="Country" htmlFor="mfg-country" error={mfgErrors.country}>
                <Input
                  id="mfg-country"
                  placeholder="e.g. United Kingdom"
                  value={mfgCountry}
                  onChange={(e) => setMfgCountry(e.target.value)}
                />
              </FormField>
              <FormField label="Contact info" htmlFor="mfg-contact" error={mfgErrors.contactInfo}>
                <Textarea
                  id="mfg-contact"
                  rows={2}
                  placeholder="Phone, email, address…"
                  value={mfgContact}
                  onChange={(e) => setMfgContact(e.target.value)}
                />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={resetMfgForm} disabled={createMfg.isPending}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleMfgSubmit} disabled={createMfg.isPending}>
                  {createMfg.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Add manufacturer
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Unit" htmlFor="unit" error={errors.unit?.message} hint="Pack size, e.g. 28's">
              <Input id="unit" placeholder="28's" {...register("unit")} />
            </FormField>
            <FormField label="Country of origin" htmlFor="country" error={errors.country?.message}>
              <Input id="country" placeholder="e.g. UK" {...register("country")} />
            </FormField>
          </div>

          <FormField
            label="Low stock threshold"
            htmlFor="lowStockThreshold"
            error={errors.lowStockThreshold?.message}
            hint="Alert when total stock across all batches falls below this."
            required
          >
            <Input
              id="lowStockThreshold"
              type="number"
              min={0}
              step={1}
              className="font-mono"
              {...register("lowStockThreshold", { valueAsNumber: true })}
            />
          </FormField>
        </form>

        <SheetFooter className="flex-row justify-end border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {isEdit ? "Save changes" : "Create product"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
