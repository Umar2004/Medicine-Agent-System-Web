import type { Metadata } from "next";
import { QuotationWizard } from "@/components/forms/QuotationWizard";

export const metadata: Metadata = { title: "New quotation" };

export default function NewQuotationPage() {
  return <QuotationWizard />;
}
