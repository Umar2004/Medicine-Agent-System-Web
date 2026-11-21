import type { Metadata } from "next";
import { OrderEdit } from "@/components/forms/OrderEdit";

export const metadata: Metadata = { title: "Edit proforma invoice" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderEdit id={id} />;
}
