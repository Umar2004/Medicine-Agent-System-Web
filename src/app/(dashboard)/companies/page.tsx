import type { Metadata } from "next";
import { CompaniesView } from "@/components/forms/CompaniesView";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage() {
  return <CompaniesView />;
}
