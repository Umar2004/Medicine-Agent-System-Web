"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { FormSheet } from "@/components/shared/FormSheet";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/users";
import type { ManagedUser } from "@/types/entities";

const empty: ResetPasswordInput = { newPassword: "", confirmPassword: "" };

export function ResetPasswordSheet({
  user,
  onClose,
}: {
  user: ManagedUser | null;
  onClose: () => void;
}) {
  const { register, handleSubmit, reset, formState } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: empty,
  });
  const { errors } = formState;

  useEffect(() => {
    if (user) reset(empty);
  }, [user, reset]);

  const save = useMutation({
    mutationFn: (values: ResetPasswordInput) => api.post<{ reset: boolean }>(`/api/users/${user?.id}/reset-password`, values),
    onSuccess: () => {
      toast.success(`Password reset for ${user?.fullName}`);
      onClose();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <FormSheet
      open={!!user}
      onOpenChange={(open) => !open && onClose()}
      title={`Reset password${user ? ` for ${user.fullName}` : ""}`}
      description="They are signed out of their other sessions. Share the new password with them securely."
      formId="reset-password-form"
      onSubmit={handleSubmit((values) => save.mutate(values))}
      submitLabel="Reset password"
      isPending={save.isPending}
    >
      <FormField label="New password" htmlFor="newPassword" error={errors.newPassword?.message} hint="At least 8 characters" required>
        <Input id="newPassword" type="password" autoComplete="new-password" autoFocus {...register("newPassword")} />
      </FormField>
      <FormField label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
      </FormField>
    </FormSheet>
  );
}
