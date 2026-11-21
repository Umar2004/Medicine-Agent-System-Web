import type { Metadata } from "next";
import { RolesEditor } from "@/components/forms/RolesEditor";

export const metadata: Metadata = { title: "Roles" };

export default function RolesPage() {
  return <RolesEditor />;
}
