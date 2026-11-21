import type { Metadata } from "next";
import { AuditLogTable } from "@/components/tables/AuditLogTable";

export const metadata: Metadata = { title: "Audit Log" };

export default function AuditLogPage() {
  return <AuditLogTable />;
}
