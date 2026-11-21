"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api-client";
import {
  loginSchema,
  registerOwnerSchema,
  type LoginInput,
  type RegisterOwnerInput,
} from "@/lib/validations/auth";
import { useCompanyStore } from "@/stores/company-store";
import type { CompanySummary, SessionUser } from "@/types/entities";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function LoginScreen() {
  const setup = useQuery({
    queryKey: ["owner-setup"],
    queryFn: () => api.get<{ available: boolean }>("/api/auth/register-owner"),
    staleTime: Infinity,
  });

  if (setup.isLoading) return <Skeleton className="h-80 w-full rounded-xl" />;
  if (setup.data?.available) return <OwnerSetupForm onDone={() => void setup.refetch()} />;
  return <LoginForm />;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (values: LoginInput) =>
      api.post<{ user: SessionUser; companies: CompanySummary[] }>("/api/auth/login", values),
    onSuccess: ({ user, companies }) => {
      // Owner starts in "All companies"; others start on their default/only company.
      const store = useCompanyStore.getState();
      const keep = store.companyId && companies.some((c) => c.id === store.companyId);
      if (!keep) {
        const pick = user.role === "owner" ? null : ((companies.find((c) => c.isDefault) ?? companies[0])?.id ?? null);
        store.setCompanyId(pick);
      }
      // Full navigation so middleware sees the new cookies.
      window.location.assign(safeNext(searchParams.get("next")));
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Enter your username and password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => {
            setError(null);
            login.mutate(values);
          })}
          className="space-y-4"
          noValidate
        >
          <FormField label="Username" htmlFor="username" error={formState.errors.username?.message}>
            <Input id="username" autoComplete="username" autoFocus {...register("username")} />
          </FormField>
          <FormField label="Password" htmlFor="password" error={formState.errors.password?.message}>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pr-9"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-text-muted hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </FormField>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-9 w-full" disabled={login.isPending}>
            {login.isPending && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function OwnerSetupForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<RegisterOwnerInput>({
    resolver: zodResolver(registerOwnerSchema),
    defaultValues: { fullName: "", username: "", email: "", password: "" },
  });
  const { errors } = formState;

  const create = useMutation({
    mutationFn: (values: RegisterOwnerInput) =>
      api.post<{ id: string; username: string }>("/api/auth/register-owner", values),
    onSuccess: ({ username }) => {
      toast.success(`Owner account "${username}" created. Please sign in.`);
      onDone();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up owner account</CardTitle>
        <CardDescription>
          No users exist yet. Create the owner account — this is only available once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => {
            setError(null);
            create.mutate(values);
          })}
          className="space-y-4"
          noValidate
        >
          <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
            <Input id="fullName" autoFocus {...register("fullName")} />
          </FormField>
          <FormField label="Username" htmlFor="setup-username" error={errors.username?.message} required>
            <Input id="setup-username" autoComplete="username" {...register("username")} />
          </FormField>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
          </FormField>
          <FormField
            label="Password"
            htmlFor="setup-password"
            error={errors.password?.message}
            hint="At least 8 characters."
            required
          >
            <Input id="setup-password" type="password" autoComplete="new-password" {...register("password")} />
          </FormField>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-9 w-full" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Create owner account
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
