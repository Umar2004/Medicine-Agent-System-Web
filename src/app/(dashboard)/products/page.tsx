import type { Metadata } from "next";
import { ProductsTable } from "@/components/tables/ProductsTable";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return <ProductsTable />;
}
