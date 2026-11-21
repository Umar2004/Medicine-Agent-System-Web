import type { Metadata } from "next";
import { SuppliersTable } from "@/components/tables/SuppliersTable";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return <SuppliersTable />;
}
