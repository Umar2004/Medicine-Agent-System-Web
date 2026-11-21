import type { Metadata } from "next";
import { SupplierPricesTable } from "@/components/tables/SupplierPricesTable";

export const metadata: Metadata = { title: "Supplier Prices" };

export default function SupplierPricesPage() {
  return <SupplierPricesTable />;
}
