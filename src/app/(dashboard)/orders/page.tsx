import type { Metadata } from "next";
import { OrdersTable } from "@/components/tables/OrdersTable";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return <OrdersTable />;
}
