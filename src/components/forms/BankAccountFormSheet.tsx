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
import { bankDetailSchema, type BankDetailInput } from "@/lib/validations/bank-details";
import type { BankAccount } from "@/types/entities";

function toFormValues(b: BankAccount | null | undefined): BankDetailInput {
  return {
    bankName: b?.bankName ?? "",
    accountNumber: b?.accountNumber ?? "",
    swiftCode: b?.swiftCode ?? "",
    branchName: b?.branchName ?? "",
    otherDetails: b?.otherDetails ?? "",
  };
}

export function BankAccountFormSheet({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: BankAccount | null;
}) {
  const isEdit = !!account;
  const queryClient = useQueryClient();
  const { currentCompany } = useCompany();
  const { register, handleSubmit, reset, formState } = useForm<BankDetailInput>({
    resolver: zodResolver(bankDetailSchema),
    defaultValues: toFormValues(account),
  });
  const { errors } = formState;

  useEffect(() => {
    if (open) reset(toFormValues(account));
  }, [open, account, reset]);

  const save = useMutation({
    mutationFn: (values: BankDetailInput) =>
      isEdit
        ? api.put<BankAccount>(`/api/bank-details/${account.id}`, values)
        : api.post<BankAccount>("/api/bank-details", values),
    onSuccess: () => {
      toast.success(isEdit ? "Bank account updated" : "Bank account added");
      void queryClient.invalidateQueries({ queryKey: ["bank-details"] });
      onOpenChange(false);
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${account.bankName}` : "New bank account"}
      description={<>{isEdit ? account.companyName : currentCompany?.name} · Printed on proforma invoices and invoices.</>}
      formId="bank-account-form"
      onSubmit={handleSubmit((values) => save.mutate(values))}
      submitLabel={isEdit ? "Save changes" : "Add bank account"}
      isPending={save.isPending}
    >
      <FormField label="Bank name" htmlFor="bankName" error={errors.bankName?.message} required>
        <Input id="bankName" placeholder="e.g. Commercial Bank of Ceylon" autoFocus {...register("bankName")} />
      </FormField>
      <FormField label="Account number" htmlFor="accountNumber" error={errors.accountNumber?.message} required>
        <Input id="accountNumber" className="font-mono" {...register("accountNumber")} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="SWIFT code" htmlFor="swiftCode" error={errors.swiftCode?.message}>
          <Input id="swiftCode" className="font-mono uppercase" {...register("swiftCode")} />
        </FormField>
        <FormField label="Branch" htmlFor="branchName" error={errors.branchName?.message}>
          <Input id="branchName" {...register("branchName")} />
        </FormField>
      </div>
      <FormField
        label="Other details"
        htmlFor="otherDetails"
        error={errors.otherDetails?.message}
        hint="Account name, bank address, intermediary bank, etc."
      >
        <Textarea id="otherDetails" rows={4} {...register("otherDetails")} />
      </FormField>
    </FormSheet>
  );
}
