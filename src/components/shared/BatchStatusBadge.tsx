import { Badge } from "@/components/ui/badge";
import type { BatchStatus } from "@/types/entities";

const STYLES: Record<BatchStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/15 text-success-text" },
  near_expiry: { label: "Near expiry", className: "bg-warning/15 text-warning-text" },
  expired: { label: "Expired", className: "bg-destructive/10 text-destructive" },
  inactive: { label: "Inactive", className: "bg-muted text-text-secondary" },
  out_of_stock: { label: "Out of stock", className: "bg-info/10 text-info-text" },
};

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = Object.fromEntries(
  Object.entries(STYLES).map(([k, v]) => [k, v.label]),
) as Record<BatchStatus, string>;

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const style = STYLES[status];
  return <Badge className={style.className}>{style.label}</Badge>;
}
