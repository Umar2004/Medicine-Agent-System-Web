import type { Metadata } from "next";
import { BatchesTable } from "@/components/tables/BatchesTable";

export const metadata: Metadata = { title: "Batches" };

export default function BatchesPage() {
  return <BatchesTable />;
}
