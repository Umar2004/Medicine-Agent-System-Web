"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { SignaturePicker } from "@/components/forms/SignaturePicker";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SESSION_QUERY_KEY, useSession } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import {
  changePasswordSchema,
  userProfileSchema,
  type ChangePasswordInput,
  type UserProfileInput,
} from "@/lib/validations/users";
import type { SessionInfo } from "@/types/entities";

function ProfileCard({ session }: { session: SessionInfo }) {
  const queryClient = useQueryClient();
  const values: UserProfileInput = {
    fullName: session.user.fullName,
    email: session.profile.email ?? "",
    phone: session.profile.phone ?? "",
  };
  const { register, handleSubmit, reset, formState } = useForm<UserProfileInput>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: values,
  });
  const { errors } = formState;

  const save = useMutation({
    mutationFn: (input: UserProfileInput) => api.put<{ updated: boolean }>("/api/auth/me", input),
    onSuccess: async (_d, input) => {
      toast.success("Profile updated");
      reset(input);
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((input) => save.mutate(input))} className="space-y-4" noValidate>
          <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
            <div>
              <dt className="text-xs text-text-secondary">Username</dt>
              <dd className="font-medium break-words">@{session.user.username}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Role</dt>
              <dd className="font-medium">{ROLE_LABELS[session.user.role]}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Last login</dt>
              <dd className="font-medium">{formatDateTime(session.profile.lastLoginAt)}</dd>
            </div>
          </dl>
          <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
            <Input id="fullName" {...register("fullName")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...register("email")} />
            </FormField>
            <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" type="tel" {...register("phone")} />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending || !formState.isDirty}>
              {save.isPending && <Loader2 className="animate-spin" />}
              Save profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const emptyPassword: ChangePasswordInput = { currentPassword: "", newPassword: "", confirmPassword: "" };

function PasswordCard({ userId }: { userId: string }) {
  const { register, handleSubmit, reset, formState } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyPassword,
  });
  const { errors } = formState;

  const save = useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post<{ changed: boolean }>(`/api/users/${userId}/change-password`, input),
    onSuccess: () => {
      toast.success("Password changed. Your other devices have been signed out.");
      reset(emptyPassword);
    },
    onError: (err) => showError(errorMessage(err), "Could not change password"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((input) => save.mutate(input))} className="space-y-4" noValidate>
          <FormField label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message} required>
            <Input id="currentPassword" type="password" autoComplete="current-password" {...register("currentPassword")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="New password" htmlFor="newPassword" error={errors.newPassword?.message} hint="At least 8 characters" required>
              <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
            </FormField>
            <FormField label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
              <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsView() {
  const { data: session } = useSession();
  const { companyId, currentCompany } = useCompany();

  if (!session) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Your own account." />
      <ProfileCard key={session.user.id} session={session} />
      <PasswordCard userId={session.user.id} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your e-signatures</CardTitle>
          <p className="text-sm text-text-secondary">
            {companyId ? `For ${currentCompany?.name ?? "this company"}. ` : ""}Used when signing invoices.
          </p>
        </CardHeader>
        <CardContent>
          {companyId ? (
            <SignaturePicker />
          ) : (
            <p className="text-sm text-text-secondary">Select a company in the top bar to manage your signatures for it.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
