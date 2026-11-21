"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { FormSheet } from "@/components/shared/FormSheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showError, showWarning } from "@/lib/alerts";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { manufacturerSchema, type ManufacturerInput } from "@/lib/validations/manufacturers";
import type { Manufacturer } from "@/types/entities";

function toFormValues(m: Manufacturer | null | undefined): ManufacturerInput {
  return { name: m?.name ?? "", country: m?.country ?? "", contactInfo: m?.contactInfo ?? "" };
}

export function ManufacturerFormSheet({
  open,
  onOpenChange,
  manufacturer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manufacturer?: Manufacturer | null;
}) {
  const isEdit = !!manufacturer;
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState } = useForm<ManufacturerInput>({
    resolver: zodResolver(manufacturerSchema),
    defaultValues: toFormValues(manufacturer),
  });
  const { errors } = formState;

  useEffect(() => {
    if (open) reset(toFormValues(manufacturer));
  }, [open, manufacturer, reset]);

  const save = useMutation({
    mutationFn: (values: ManufacturerInput) =>
      isEdit
        ? api.put<Manufacturer>(`/api/manufacturers/${manufacturer.id}`, values)
        : api.post<Manufacturer>("/api/manufacturers", values),
    onSuccess: (saved) => {
      toast.success(isEdit ? "Manufacturer updated" : `Manufacturer ${saved.manufacturerNumber} created`);
      void queryClient.invalidateQueries({ queryKey: ["manufacturers"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.status === 409) showWarning(err.message, "Duplicate manufacturer");
      else showError(errorMessage(err));
    },
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${manufacturer.manufacturerNumber}` : "New manufacturer"}
      description="Manufacturers are shared by all companies. The number is generated automatically."
      formId="manufacturer-form"
      onSubmit={handleSubmit((values) => save.mutate(values))}
      submitLabel={isEdit ? "Save changes" : "Create manufacturer"}
      isPending={save.isPending}
    >
      <FormField label="Name" htmlFor="name" error={errors.name?.message} required>
        <Input id="name" placeholder="e.g. AstraZeneca" autoFocus {...register("name")} />
      </FormField>
      <FormField label="Country" htmlFor="country" error={errors.country?.message}>
        <Input id="country" placeholder="e.g. United Kingdom" {...register("country")} />
      </FormField>
      <FormField label="Contact info" htmlFor="contactInfo" error={errors.contactInfo?.message}>
        <Textarea id="contactInfo" rows={3} placeholder="Phone, email, address…" {...register("contactInfo")} />
      </FormField>
    </FormSheet>
  );
}
