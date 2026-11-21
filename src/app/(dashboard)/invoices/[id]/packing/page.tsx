import type { Metadata } from "next";
import { PackingListEditor } from "@/components/forms/PackingListEditor";

export const metadata: Metadata = { title: "Packing list" };

export default async function InvoicePackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PackingListEditor invoiceId={id} />;
}
