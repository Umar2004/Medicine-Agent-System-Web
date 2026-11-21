import type { Batch, OrderItemDetail } from "@/types/entities";

/** orderItemId → batchId → quantity (page-local state of the batch assignment page). */
export type Allocation = Record<string, Record<string, number>>;

export type LineStatus = "pending" | "partial" | "done";

export const STATUS_LABEL: Record<LineStatus, string> = {
  pending: "pending",
  partial: "partially assigned",
  done: "assigned",
};

/** "full" = MFD and EXP both match the PI line; "mfd" / "exp" = only one does. */
export type MatchKind = "full" | "mfd" | "exp" | null;

export function matchKind(line: Pick<OrderItemDetail, "mfd" | "exp">, b: Pick<Batch, "mfd" | "exp">): MatchKind {
  const mfd = !!line.mfd && line.mfd === b.mfd;
  const exp = !!line.exp && line.exp === b.exp;
  if (mfd && exp) return "full";
  if (mfd) return "mfd";
  if (exp) return "exp";
  return null;
}

const MATCH_RANK: Record<NonNullable<MatchKind> | "none", number> = { full: 0, mfd: 1, exp: 1, none: 2 };

/** Matching batches first; otherwise keep the API order (earliest expiry first — FEFO). */
export function sortBatches(line: OrderItemDetail, batches: Batch[]): Batch[] {
  return batches
    .map((b, i) => ({ b, i, rank: MATCH_RANK[matchKind(line, b) ?? "none"] }))
    .sort((x, y) => x.rank - y.rank || x.i - y.i)
    .map((x) => x.b);
}

export function assignedQty(alloc: Allocation, lineId: string): number {
  return Object.values(alloc[lineId] ?? {}).reduce((s, q) => s + q, 0);
}

/** Stock this line may still take from a batch = batch stock − what other lines of the order take from it. */
export function availableFor(alloc: Allocation, lineId: string, b: Batch): number {
  let usedElsewhere = 0;
  for (const [otherId, parts] of Object.entries(alloc)) if (otherId !== lineId) usedElsewhere += parts[b.id] ?? 0;
  return Math.max(0, b.stockQuantity - usedElsewhere);
}

/** Batches of this line whose quantity is more than they can give. */
export function overStock(alloc: Allocation, line: OrderItemDetail, batches: Batch[] | undefined): string[] {
  const parts = alloc[line.id] ?? {};
  return Object.entries(parts)
    .filter(([bid, q]) => {
      const b = batches?.find((x) => x.id === bid);
      return !b || q > availableFor(alloc, line.id, b);
    })
    .map(([bid]) => bid);
}

export function lineStatus(alloc: Allocation, line: OrderItemDetail, batches: Batch[] | undefined): LineStatus {
  const got = assignedQty(alloc, line.id);
  if (got === 0) return "pending";
  if (got === line.quantity && overStock(alloc, line, batches).length === 0) return "done";
  return "partial";
}

/**
 * Fill what this line still needs, keeping quantities already typed: MFD/EXP-matching batches
 * first, then earliest expiry. Never takes more than a batch can give (stock shared across lines).
 */
export function autoFillLine(alloc: Allocation, line: OrderItemDetail, batches: Batch[]): Allocation {
  let remaining = line.quantity - assignedQty(alloc, line.id);
  if (remaining <= 0) return alloc;
  const parts = { ...(alloc[line.id] ?? {}) };
  for (const b of sortBatches(line, batches)) {
    if (remaining <= 0) break;
    const room = availableFor(alloc, line.id, b) - (parts[b.id] ?? 0);
    const take = Math.min(remaining, room);
    if (take > 0) {
      parts[b.id] = (parts[b.id] ?? 0) + take;
      remaining -= take;
    }
  }
  return { ...alloc, [line.id]: parts };
}
