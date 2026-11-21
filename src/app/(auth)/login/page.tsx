import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/forms/LoginScreen";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
