import type { Metadata } from "next";
import { QuotationsTable } from "@/components/tables/QuotationsTable";

export const metadata: Metadata = { title: "Quotations" };

export default function QuotationsPage() {
  return <QuotationsTable />;
}
