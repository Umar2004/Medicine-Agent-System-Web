import type { Metadata } from "next";
import { BankAccountsTable } from "@/components/tables/BankAccountsTable";

export const metadata: Metadata = { title: "Bank Accounts" };

export default function BankAccountsPage() {
  return <BankAccountsTable />;
}
