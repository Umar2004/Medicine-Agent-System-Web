import type { Metadata } from "next";
import { QuotationDetail } from "@/components/forms/QuotationDetail";

export const metadata: Metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuotationDetail id={id} />;
}
