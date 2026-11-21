import type { Metadata } from "next";
import { UsersTable } from "@/components/tables/UsersTable";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return <UsersTable />;
}
