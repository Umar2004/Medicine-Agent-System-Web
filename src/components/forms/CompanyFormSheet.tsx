"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { FormSheet } from "@/components/shared/FormSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SESSION_QUERY_KEY } from "@/hooks/use-auth";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { companySchema, type CompanyInput } from "@/lib/validations/companies";
import type { CompanyDetail } from "@/types/entities";

function toFormValues(c: CompanyDetail | null | undefined): CompanyInput {
  return {
    name: c?.name ?? "",
    address: c?.address ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    website: c?.website ?? "",
    taxId: c?.taxId ?? "",
    currency: c?.currency ?? "USD",
  };
}

export function CompanyFormSheet({
  open,
  onOpenChange,
  company,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: CompanyDetail | null;
}) {
  const isEdit = !!company;
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
    defaultValues: toFormValues(company),
  });
  const { errors } = formState;

  useEffect(() => {
    if (!open) return;
    reset(toFormValues(company));
    setLogo(company?.logoPreviewUrl ?? null);
  }, [open, company, reset]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["companies"] });
    // The company selector reads the session's company list.
    void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: (values: CompanyInput) =>
      isEdit ? api.put<CompanyDetail>(`/api/companies/${company.id}`, values) : api.post<CompanyDetail>("/api/companies", values),
    onSuccess: (saved) => {
      toast.success(isEdit ? "Company updated" : `${saved.name} created`);
      refresh();
      onOpenChange(false);
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set("file", file);
      return api.upload<CompanyDetail>(`/api/companies/${company?.id}/logo`, body);
    },
    onSuccess: (saved) => {
      setLogo(saved.logoPreviewUrl);
      toast.success("Logo updated");
      refresh();
    },
    onError: (err) => showError(errorMessage(err), "Upload failed"),
    onSettled: () => {
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  const removeLogo = useMutation({
    mutationFn: () => api.del<CompanyDetail>(`/api/companies/${company?.id}/logo`),
    onSuccess: () => {
      setLogo(null);
      toast.success("Logo removed");
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${company.name}` : "New company"}
      description="These details print on this company's proforma invoices, invoices and packing lists."
      formId="company-form"
      onSubmit={handleSubmit((values) => save.mutate(values))}
      submitLabel={isEdit ? "Save changes" : "Create company"}
      isPending={save.isPending}
    >
      <FormField label="Company name" htmlFor="name" error={errors.name?.message} required>
        <Input id="name" autoFocus {...register("name")} />
      </FormField>
      <FormField label="Address" htmlFor="address" error={errors.address?.message}>
        <Textarea id="address" rows={3} {...register("address")} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register("phone")} />
        </FormField>
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} />
        </FormField>
      </div>
      <FormField label="Website" htmlFor="website" error={errors.website?.message}>
        <Input id="website" {...register("website")} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Tax ID" htmlFor="taxId" error={errors.taxId?.message}>
          <Input id="taxId" {...register("taxId")} />
        </FormField>
        <FormField label="Currency" htmlFor="currency" error={errors.currency?.message} required>
          <Input id="currency" maxLength={3} className="font-mono uppercase" {...register("currency")} />
        </FormField>
      </div>

      <div className="space-y-1.5">
        <p className="text-[13px] font-medium">Logo</p>
        {isEdit ? (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded bg-paper ring-1 ring-border">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={logo} alt={`${company.name} logo`} className="max-h-16 max-w-16 object-contain" />
              ) : (
                <Building2 className="size-6 text-text-muted" />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  aria-label="Logo image"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo.mutate(file);
                  }}
                />
                <Button type="button" variant="outline" size="sm" disabled={uploadLogo.isPending} onClick={() => fileRef.current?.click()}>
                  {uploadLogo.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                  Upload PNG/JPG
                </Button>
                {logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={removeLogo.isPending}
                    onClick={() => removeLogo.mutate()}
                  >
                    <Trash2 />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-text-muted">Max 2 MB. Under 200 KB keeps PDFs small; every PDF includes the logo.</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted">You can add a logo after creating the company.</p>
        )}
      </div>
    </FormSheet>
  );
}
