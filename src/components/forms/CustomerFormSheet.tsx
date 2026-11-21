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
import { showError, showWarning } from "@/lib/alerts";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { customerSchema, type CustomerInput } from "@/lib/validations/customers";
import type { Customer, CustomerSaveResult } from "@/types/entities";

function toFormValues(c: Customer | null | undefined): CustomerInput {
  return {
    code: c?.code ?? "",
    name: c?.name ?? "",
    businessName: c?.businessName ?? "",
    contactPerson: c?.contactPerson ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    city: c?.city ?? "",
    country: c?.country ?? "",
  };
}

export function CustomerFormSheet({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
}) {
  const isEdit = !!customer;
  const queryClient = useQueryClient();
  const { currentCompany } = useCompany();
  const { register, handleSubmit, reset, formState } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: toFormValues(customer),
  });
  const { errors } = formState;

  useEffect(() => {
    if (open) reset(toFormValues(customer));
  }, [open, customer, reset]);

  const save = useMutation({
    mutationFn: (values: CustomerInput) =>
      isEdit
        ? api.put<CustomerSaveResult>(`/api/customers/${customer.id}`, values)
        : api.post<CustomerSaveResult>("/api/customers", values),
    onSuccess: (saved) => {
      toast.success(isEdit ? "Customer updated" : `Customer ${saved.customerNumber} created`);
      // CLAUDE.md §7.7: similar names are a soft warning only.
      if (saved.similar.length > 0) {
        const names = saved.similar
          .map((s) => `${s.name}${s.businessName ? ` (${s.businessName})` : ""} — ${s.customerNumber}`)
          .join("; ");
        toast.warning("Possible duplicate customer", { description: `Similar: ${names}`, duration: 10_000 });
      }
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.status === 409) showWarning(err.message, "Code already in use");
      else showError(errorMessage(err));
    },
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${customer.customerNumber}` : "New customer"}
      description={
        <>
          {isEdit ? customer.companyName : currentCompany?.name} · The customer number is generated automatically.
        </>
      }
      formId="customer-form"
      onSubmit={handleSubmit((values) => save.mutate(values))}
      submitLabel={isEdit ? "Save changes" : "Create customer"}
      isPending={save.isPending}
    >
      <div className="grid grid-cols-3 gap-4">
        <FormField
          label="Code"
          htmlFor="code"
          error={errors.code?.message}
          hint="Used in invoice numbers, e.g. 13/SFL/08/2026"
          className="col-span-1"
          required
        >
          <Input id="code" className="font-mono uppercase" placeholder="SFL" maxLength={10} {...register("code")} />
        </FormField>
        <FormField label="Name" htmlFor="name" error={errors.name?.message} className="col-span-2" required>
          <Input id="name" autoFocus {...register("name")} />
        </FormField>
      </div>
      <FormField label="Business name" htmlFor="businessName" error={errors.businessName?.message}>
        <Input id="businessName" {...register("businessName")} />
      </FormField>
      <FormField label="Contact person" htmlFor="contactPerson" error={errors.contactPerson?.message}>
        <Input id="contactPerson" {...register("contactPerson")} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register("phone")} />
        </FormField>
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} />
        </FormField>
      </div>
      <FormField label="Address" htmlFor="address" error={errors.address?.message}>
        <Textarea id="address" rows={2} {...register("address")} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="City" htmlFor="city" error={errors.city?.message}>
          <Input id="city" {...register("city")} />
        </FormField>
        <FormField label="Country" htmlFor="country" error={errors.country?.message}>
          <Input id="country" placeholder="e.g. Kenya" {...register("country")} />
        </FormField>
      </div>
    </FormSheet>
  );
}
