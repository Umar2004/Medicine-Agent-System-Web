import type { Metadata } from "next";
import { InvoicesTable } from "@/components/tables/InvoicesTable";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return <InvoicesTable />;
}
