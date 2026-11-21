import type { Metadata } from "next";
import { QuotationEdit } from "@/components/forms/QuotationEdit";

export const metadata: Metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuotationEdit id={id} />;
}
