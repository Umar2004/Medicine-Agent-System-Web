import type { Metadata } from "next";
import { PackingListsTable } from "@/components/tables/PackingListsTable";

export const metadata: Metadata = { title: "Packing lists" };

export default function PackingPage() {
  return <PackingListsTable />;
}
