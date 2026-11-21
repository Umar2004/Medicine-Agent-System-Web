import { count, eq } from "drizzle-orm";
import { db, invoiceItems, orderItems, productBatches } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import {
  assertBatchNumberFree,
  assertProductExists,
  BATCH_READ_ROUTES,
  batchUsage,
  currentMonthIndex,
  deactivateExpiredBatches,
  findBatch,
  recordSupplierPrice,
  supplierCompany,
} from "@/lib/batches";
import { ACTION_TYPES } from "@/lib/constants";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { batchSchema, emptyToNull, monthIndex } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Batch");
  const user = await requireAuth(req);
  await requireAnyModule(user, BATCH_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });
  await deactivateExpiredBatches();

  const batch = await findBatch(id);
  if (!batch) throw errors.notFound("Batch");
  return ok({ ...batch, usage: await batchUsage(id) });
});

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Batch");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_batches", { meta, companyId: null });

  const before = await findBatch(id);
  if (!before) throw errors.notFound("Batch");

  const input = await parseBody(req, batchSchema);
  const usage = await batchUsage(id);
  if (input.productId !== before.productId) {
    if (usage.orders + usage.invoices > 0) {
      throw errors.conflict("This batch is already used in orders or invoices, so its product cannot be changed.");
    }
    await assertProductExists(input.productId);
  }
  await assertBatchNumberFree(input.productId, input.batchNumber, id);

  const expired = monthIndex(input.exp) < currentMonthIndex();
  if (input.isActive && expired && !before.isActive) {
    throw errors.badRequest("An expired batch cannot be re-activated. Correct the EXP date first.");
  }

  const supplierId = emptyToNull(input.supplierId);
  const supplierCompanyId = await supplierCompany(supplierId);
  const priceType = input.priceType || null;
  const priceChanged =
    supplierId !== before.supplierId || input.costPrice !== before.costPrice || priceType !== before.priceType;

  await db.transaction(async (tx) => {
    await tx
      .update(productBatches)
      .set({
        productId: input.productId,
        batchNumber: input.batchNumber,
        supplierId,
        mfd: input.mfd,
        exp: input.exp,
        stockQuantity: input.stockQuantity,
        costPrice: input.costPrice === null ? null : input.costPrice.toFixed(2),
        priceType,
        isActive: input.isActive && !expired,
        updatedAt: new Date(),
      })
      .where(eq(productBatches.id, id));
    if (priceChanged) {
      await recordSupplierPrice(tx, {
        supplierId,
        supplierCompanyId,
        productId: input.productId,
        costPrice: input.costPrice,
        priceType,
        batchNumber: input.batchNumber,
      });
    }
  });

  const after = await findBatch(id);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.BATCH_UPDATED,
    entityName: "Batch",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  if (before.stockQuantity !== input.stockQuantity) {
    auditLog({
      user,
      companyId: null,
      actionType: ACTION_TYPES.STOCK_UPDATED,
      entityName: "Batch",
      entityId: id,
      oldValue: { stockQuantity: before.stockQuantity },
      newValue: { stockQuantity: input.stockQuantity, usedInOrders: usage.orders, usedInInvoices: usage.invoices },
      meta,
    });
  }
  return ok({ ...after, usage });
});

export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Batch");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_batches", { meta, companyId: null });

  const before = await findBatch(id);
  if (!before) throw errors.notFound("Batch");

  // CLAUDE.md §7.4: blocked if used in any order or invoice (including closed ones — they are history).
  const [[{ o }], [{ i }]] = await Promise.all([
    db.select({ o: count() }).from(orderItems).where(eq(orderItems.batchId, id)),
    db.select({ i: count() }).from(invoiceItems).where(eq(invoiceItems.batchId, id)),
  ]);
  if (o + i > 0) {
    throw errors.conflict(
      "This batch is used in orders or invoices and cannot be deleted. Mark it inactive instead.",
    );
  }

  await db.update(productBatches).set({ isDeleted: true, updatedAt: new Date() }).where(eq(productBatches.id, id));

  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.BATCH_DELETED,
    entityName: "Batch",
    entityId: id,
    oldValue: before,
    meta,
  });
  return ok({ id });
});
