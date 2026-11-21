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
import { useCompany } from "@/hooks/use-company";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { supplierSchema, type SupplierInput } from "@/lib/validations/suppliers";
import type { Supplier } from "@/types/entities";

function toFormValues(s: Supplier | null | undefined): SupplierInput {
  return {
    name: s?.name ?? "",
    contactPerson: s?.contactPerson ?? "",
    phone: s?.phone ?? "",
    contactNumber: s?.contactNumber ?? "",
    email: s?.email ?? "",
    address: s?.address ?? "",
    city: s?.city ?? "",
    country: s?.country ?? "",
  };
}

export function SupplierFormSheet({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
}) {
  const isEdit = !!supplier;
  const queryClient = useQueryClient();
  const { currentCompany } = useCompany();
  const { register, handleSubmit, reset, formState } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: toFormValues(supplier),
  });
  const { errors } = formState;

  useEffect(() => {
    if (open) reset(toFormValues(supplier));
  }, [open, supplier, reset]);

  const save = useMutation({
    mutationFn: (values: SupplierInput) =>
      isEdit
        ? api.put<Supplier>(`/api/suppliers/${supplier.id}`, values)
        : api.post<Supplier>("/api/suppliers", values),
    onSuccess: (saved) => {
      toast.success(isEdit ? "Supplier updated" : `Supplier ${saved.supplierNumber} created`);
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      onOpenChange(false);
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${supplier.supplierNumber}` : "New supplier"}
      description={<>{isEdit ? supplier.companyName : currentCompany?.name} · The supplier number is generated automatically.</>}
      formId="supplier-form"
      onSubmit={handleSubmit((values) => save.mutate(values))}
      submitLabel={isEdit ? "Save changes" : "Create supplier"}
      isPending={save.isPending}
    >
      <FormField label="Name" htmlFor="name" error={errors.name?.message} required>
        <Input id="name" autoFocus {...register("name")} />
      </FormField>
      <FormField label="Contact person" htmlFor="contactPerson" error={errors.contactPerson?.message}>
        <Input id="contactPerson" {...register("contactPerson")} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register("phone")} />
        </FormField>
        <FormField label="Other contact number" htmlFor="contactNumber" error={errors.contactNumber?.message}>
          <Input id="contactNumber" type="tel" {...register("contactNumber")} />
        </FormField>
      </div>
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" {...register("email")} />
      </FormField>
      <FormField label="Address" htmlFor="address" error={errors.address?.message}>
        <Textarea id="address" rows={2} {...register("address")} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="City" htmlFor="city" error={errors.city?.message}>
          <Input id="city" {...register("city")} />
        </FormField>
        <FormField label="Country" htmlFor="country" error={errors.country?.message}>
          <Input id="country" placeholder="e.g. Sri Lanka" {...register("country")} />
        </FormField>
      </div>
    </FormSheet>
  );
}
