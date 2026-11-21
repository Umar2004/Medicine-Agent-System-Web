import type { Metadata } from "next";
import { ProformaWizard } from "@/components/forms/ProformaWizard";

export const metadata: Metadata = { title: "New proforma invoice" };

export default function NewOrderPage() {
  return <ProformaWizard />;
}
