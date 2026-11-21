import type { Metadata } from "next";
import { ManufacturersTable } from "@/components/tables/ManufacturersTable";

export const metadata: Metadata = { title: "Manufacturers" };

export default function ManufacturersPage() {
  return <ManufacturersTable />;
}
