import { eq } from "drizzle-orm";
import { db, productBatches } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { batchUsage, findBatch } from "@/lib/batches";
import { ACTION_TYPES } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { batchStockSchema } from "@/lib/validations";

type Params = { id: string };

/** Stock-only correction (CLAUDE.md §7.6) — audited with the reason given. */
export const PATCH = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Batch");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_batches", { meta, companyId: null });

  const before = await findBatch(id);
  if (!before) throw errors.notFound("Batch");
  const input = await parseBody(req, batchStockSchema);

  await db
    .update(productBatches)
    .set({ stockQuantity: input.stockQuantity, updatedAt: new Date() })
    .where(eq(productBatches.id, id));

  const usage = await batchUsage(id);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.STOCK_UPDATED,
    entityName: "Batch",
    entityId: id,
    oldValue: { stockQuantity: before.stockQuantity },
    newValue: { stockQuantity: input.stockQuantity, reason: input.reason ?? null, usedInOrders: usage.orders },
    meta,
  });
  return ok({ ...(await findBatch(id)), usage });
});
