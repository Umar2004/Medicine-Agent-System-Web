import { Badge } from "@/components/ui/badge";

/** Product stock vs its own low-stock threshold (CLAUDE.md §7.9). */
export function StockBadge({ totalStock, threshold }: { totalStock: number; threshold: number }) {
  if (totalStock === 0) {
    return <Badge className="bg-destructive/10 text-destructive">Out of stock</Badge>;
  }
  if (totalStock < threshold) {
    return <Badge className="bg-warning/15 text-warning-text">Low stock</Badge>;
  }
  return <Badge className="bg-success/15 text-success-text">In stock</Badge>;
}
