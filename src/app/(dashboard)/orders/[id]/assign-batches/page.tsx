import type { Metadata } from "next";
import { AssignBatches } from "@/components/forms/AssignBatches";

export const metadata: Metadata = { title: "Assign batches" };

export default async function AssignBatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssignBatches id={id} />;
}
