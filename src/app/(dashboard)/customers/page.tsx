import type { Metadata } from "next";
import { CustomersTable } from "@/components/tables/CustomersTable";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <CustomersTable />;
}
