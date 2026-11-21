import { AppShell } from "@/components/layout/AppShell";

// middleware.ts guarantees a valid access token before this renders.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
