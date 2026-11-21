import { and, asc, count, desc, eq, ilike, or, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { db, productBatches, products, suppliers } from "@/db";
import { errors, handler, isUuid, likePattern, ok, paginated, parseBody, parsePagination, parseSort } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import {
  assertBatchNumberFree,
  assertProductExists,
  BATCH_READ_ROUTES,
  batchQuery,
  currentMonthIndex,
  deactivateExpiredBatches,
  expSortKey,
  findBatch,
  recordSupplierPrice,
  statusFilter,
  supplierCompany,
} from "@/lib/batches";
import { ACTION_TYPES } from "@/lib/constants";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import {
  BATCH_SORT_FIELDS,
  BATCH_STATUSES,
  batchSchema,
  emptyToNull,
  monthIndex,
  type BatchSortField,
  type BatchStatus,
} from "@/lib/validations";

// Batches are SHARED (one physical warehouse) — no company_id.

const sortColumns: Record<BatchSortField, AnyColumn | SQLWrapper> = {
  batchNumber: productBatches.batchNumber,
  productName: products.brandName,
  exp: expSortKey,
  stockQuantity: productBatches.stockQuantity,
  costPrice: productBatches.costPrice,
  supplierName: suppliers.name,
  createdAt: productBatches.createdAt,
};

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  await requireAnyModule(user, BATCH_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });
  await deactivateExpiredBatches();

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, BATCH_SORT_FIELDS, "exp");
  const search = params.get("search")?.trim();
  const productId = params.get("productId");
  const supplierId = params.get("supplierId");
  const status = params.get("status");
  if (productId && !isUuid(productId)) throw errors.badRequest("Invalid product");
  if (supplierId && !isUuid(supplierId)) throw errors.badRequest("Invalid supplier");

  const where = and(
    eq(productBatches.isDeleted, false),
    productId ? eq(productBatches.productId, productId) : undefined,
    supplierId ? eq(productBatches.supplierId, supplierId) : undefined,
    status && (BATCH_STATUSES as readonly string[]).includes(status) ? statusFilter(status as BatchStatus) : undefined,
    search
      ? or(
          ilike(productBatches.batchNumber, likePattern(search)),
          ilike(products.brandName, likePattern(search)),
          ilike(products.productNumber, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    batchQuery()
      .where(where)
      .orderBy((isDesc ? desc : asc)(sortColumns[sortBy]), asc(productBatches.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(productBatches)
      .innerJoin(products, eq(products.id, productBatches.productId))
      .where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});

export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_batches", { meta, companyId: null });

  const input = await parseBody(req, batchSchema);
  await assertProductExists(input.productId);
  await assertBatchNumberFree(input.productId, input.batchNumber);
  const supplierId = emptyToNull(input.supplierId);
  const supplierCompanyId = await supplierCompany(supplierId);
  const priceType = input.priceType || null;
  const isExpiredNow = monthIndex(input.exp) < currentMonthIndex();

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(productBatches)
      .values({
        productId: input.productId,
        batchNumber: input.batchNumber,
        supplierId,
        mfd: input.mfd,
        exp: input.exp,
        stockQuantity: input.stockQuantity,
        costPrice: input.costPrice === null ? null : input.costPrice.toFixed(2),
        priceType,
        isActive: input.isActive && !isExpiredNow,
      })
      .returning({ id: productBatches.id });
    await recordSupplierPrice(tx, {
      supplierId,
      supplierCompanyId,
      productId: input.productId,
      costPrice: input.costPrice,
      priceType,
      batchNumber: input.batchNumber,
    });
    return row.id;
  });

  const batch = await findBatch(id);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.BATCH_CREATED,
    entityName: "Batch",
    entityId: id,
    newValue: batch,
    meta,
  });
  return ok(batch, { status: 201 });
});
