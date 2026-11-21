"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { FormSheet } from "@/components/shared/FormSheet";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { assignableRoles, ROLE_LABELS } from "@/lib/constants";
import { ownerEditFormSchema, userCreateSchema, userEditFormSchema, type UserCreateInput } from "@/lib/validations/users";
import type { ManagedUser } from "@/types/entities";

function toFormValues(u: ManagedUser | null | undefined, companyIds: string[]): UserCreateInput {
  return {
    fullName: u?.fullName ?? "",
    username: u?.username ?? "",
    password: "",
    email: u?.email ?? "",
    phone: u?.phone ?? "",
    role: u?.role ?? "office_staff",
    // A one-company admin creating a user: that company is the only choice.
    companyIds: u ? u.companies.map((c) => c.id) : companyIds.length === 1 ? companyIds : [],
    defaultCompanyId: u?.companies.find((c) => c.isDefault)?.id ?? "",
  };
}

export function UserFormSheet({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: ManagedUser | null;
}) {
  const isEdit = !!user;
  const isOwnerTarget = user?.role === "owner";
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { companies } = useCompany();
  const allCompanyIds = companies.map((c) => c.id).join(",");

  const schema = !isEdit ? userCreateSchema : isOwnerTarget ? ownerEditFormSchema : userEditFormSchema;
  const { register, handleSubmit, reset, control, setValue, formState } = useForm<UserCreateInput>({
    resolver: zodResolver(schema) as Resolver<UserCreateInput>,
    defaultValues: toFormValues(user, []),
  });
  const { errors } = formState;
  const selected = useWatch({ control, name: "companyIds" }) ?? [];
  const defaultCompanyId = useWatch({ control, name: "defaultCompanyId" });

  useEffect(() => {
    if (open) reset(toFormValues(user, allCompanyIds ? allCompanyIds.split(",") : []));
  }, [open, user, reset, allCompanyIds]);

  const save = useMutation({
    mutationFn: async (values: UserCreateInput) => {
      if (!isEdit) return api.post<ManagedUser>("/api/users", values);
      const { fullName, email, phone, role, companyIds, defaultCompanyId: def } = values;
      const saved = await api.put<ManagedUser>(`/api/users/${user.id}`, { fullName, email, phone, role });
      if (isOwnerTarget) return saved;
      return api.put<ManagedUser>(`/api/users/${user.id}/companies`, { companyIds, defaultCompanyId: def });
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? "User updated" : `User ${saved.username} created`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const roles = session ? assignableRoles(session.user.role) : [];

  function toggleCompany(id: string, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((c) => c !== id);
    setValue("companyIds", next, { shouldDirty: true, shouldValidate: formState.isSubmitted });
    if (!checked && defaultCompanyId === id) setValue("defaultCompanyId", "", { shouldDirty: true });
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${user.fullName}` : "New user"}
      description={isEdit ? `@${user.username}` : "They sign in with this username and password."}
      formId="user-form"
      onSubmit={handleSubmit((values) => save.mutate(values))}
      submitLabel={isEdit ? "Save changes" : "Create user"}
      isPending={save.isPending}
    >
      <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
        <Input id="fullName" autoFocus {...register("fullName")} />
      </FormField>
      {!isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Username" htmlFor="username" error={errors.username?.message} required>
            <Input id="username" autoComplete="off" {...register("username")} />
          </FormField>
          <FormField label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters" required>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          </FormField>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} />
        </FormField>
        <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register("phone")} />
        </FormField>
      </div>
      <FormField
        label="Role"
        htmlFor="role"
        error={errors.role?.message}
        hint={isOwnerTarget ? "An owner account keeps the owner role." : undefined}
        required
      >
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={isOwnerTarget}>
              <SelectTrigger id="role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isOwnerTarget ? (
                  <SelectItem value="owner">{ROLE_LABELS.owner}</SelectItem>
                ) : (
                  roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      {!isOwnerTarget && (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">
            Companies<span className="text-destructive">*</span>
          </p>
          <div className="divide-y rounded-lg border">
            {companies.map((c) => {
              const checked = selected.includes(c.id);
              return (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <input
                    id={`company-${c.id}`}
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    onChange={(e) => toggleCompany(c.id, e.target.checked)}
                  />
                  <label htmlFor={`company-${c.id}`} className="flex-1 text-sm">
                    {c.name}
                  </label>
                  {checked && selected.length > 1 && (
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <input
                        type="radio"
                        name="defaultCompany"
                        className="accent-primary"
                        checked={defaultCompanyId === c.id}
                        onChange={() => setValue("defaultCompanyId", c.id, { shouldDirty: true })}
                      />
                      Default
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {errors.companyIds?.message ? (
            <p className="text-xs text-destructive">{errors.companyIds.message}</p>
          ) : (
            <p className="text-xs text-text-muted">The default opens first when they sign in.</p>
          )}
        </div>
      )}
    </FormSheet>
  );
}
