import "server-only";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import {
  companies,
  db,
  invoiceItems,
  invoices,
  orderItems,
  orders,
  productBatches,
  products,
  supplierPriceHistory,
  suppliers,
  type Transaction,
} from "@/db";
import { errors } from "@/lib/api";
import { BUSINESS_TIMEZONE, NEAR_EXPIRY_MONTHS, type PriceType } from "@/lib/constants";
import type { BatchStatus } from "@/lib/validations";

// MFD/EXP are MM/YYYY text. A batch is usable through the end of its EXP month.

// CASE guards to_date from malformed values (AND does not short-circuit in Postgres).
const EXP_MONTH = sql`(case when ${productBatches.exp} ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
  then to_date(${productBatches.exp}, 'MM/YYYY') end)`;
const THIS_MONTH = sql`date_trunc('month', now() at time zone ${BUSINESS_TIMEZONE})::date`;

/** Sort key for EXP (MM/YYYY text does not sort chronologically). */
export const expSortKey: SQL = EXP_MONTH;

export const isExpired: SQL = sql`coalesce(${EXP_MONTH} < ${THIS_MONTH}, false)`;
export const isNearExpiry: SQL = sql`coalesce(${EXP_MONTH} >= ${THIS_MONTH}
  and ${EXP_MONTH} < ${THIS_MONTH} + make_interval(months => ${NEAR_EXPIRY_MONTHS}), false)`;

/** Current month as year*12 + month0 in the business timezone (matches monthIndex()). */
export function currentMonthIndex(): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return year * 12 + (month - 1);
}

export const batchStatus = sql<BatchStatus>`case
  when ${isExpired} then 'expired'
  when not ${productBatches.isActive} then 'inactive'
  when ${productBatches.stockQuantity} = 0 then 'out_of_stock'
  when ${isNearExpiry} then 'near_expiry'
  else 'active' end`;

export function statusFilter(status: BatchStatus): SQL {
  switch (status) {
    case "expired":
      return isExpired;
    case "near_expiry":
      return sql`(not ${isExpired} and ${isNearExpiry})`;
    case "inactive":
      return sql`(not ${isExpired} and not ${productBatches.isActive})`;
    case "out_of_stock":
      return sql`(${productBatches.stockQuantity} = 0)`;
    case "active":
      return sql`(not ${isExpired} and ${productBatches.isActive} and ${productBatches.stockQuantity} > 0)`;
  }
}

/** CLAUDE.md §7.14: expired batches are switched inactive when accessed. */
export async function deactivateExpiredBatches(): Promise<void> {
  await db
    .update(productBatches)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(productBatches.isActive, true), eq(productBatches.isDeleted, false), isExpired));
}

export const batchColumns = {
  id: productBatches.id,
  batchNumber: productBatches.batchNumber,
  productId: productBatches.productId,
  productNumber: products.productNumber,
  productName: products.brandName,
  productUnit: products.unit,
  supplierId: productBatches.supplierId,
  supplierName: suppliers.name,
  supplierCompanyName: companies.name,
  mfd: productBatches.mfd,
  exp: productBatches.exp,
  stockQuantity: productBatches.stockQuantity,
  costPrice: sql<number | null>`${productBatches.costPrice}::float8`,
  priceType: productBatches.priceType,
  isActive: productBatches.isActive,
  status: batchStatus,
  createdAt: productBatches.createdAt,
  updatedAt: productBatches.updatedAt,
};

export function batchQuery() {
  return db
    .select(batchColumns)
    .from(productBatches)
    .innerJoin(products, eq(products.id, productBatches.productId))
    .leftJoin(suppliers, eq(suppliers.id, productBatches.supplierId))
    .leftJoin(companies, eq(companies.id, suppliers.companyId));
}

export async function findBatch(id: string) {
  const [row] = await batchQuery()
    .where(and(eq(productBatches.id, id), eq(productBatches.isDeleted, false)))
    .limit(1);
  return row ?? null;
}

/** How many order lines / invoice lines point at this batch (live documents only). */
export async function batchUsage(batchId: string): Promise<{ orders: number; invoices: number }> {
  const [o] = await db
    .select({ n: sql<number>`count(distinct ${orders.id})::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.batchId, batchId), eq(orders.isDeleted, false), ne(orders.status, "cancelled")));
  const [i] = await db
    .select({ n: sql<number>`count(distinct ${invoices.id})::int` })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
    .where(and(eq(invoiceItems.batchId, batchId), eq(invoices.isDeleted, false)));
  return { orders: o?.n ?? 0, invoices: i?.n ?? 0 };
}

/** CLAUDE.md §7.7: batch number unique per product (soft-deleted rows still hold the number). */
export async function assertBatchNumberFree(productId: string, batchNumber: string, excludeId?: string): Promise<void> {
  const [dup] = await db
    .select({ id: productBatches.id, isDeleted: productBatches.isDeleted })
    .from(productBatches)
    .where(
      and(
        eq(productBatches.productId, productId),
        sql`lower(${productBatches.batchNumber}) = lower(${batchNumber})`,
        excludeId ? ne(productBatches.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (dup) {
    throw errors.conflict(
      dup.isDeleted
        ? `Batch "${batchNumber}" was used before for this product (deleted). Use a different batch number.`
        : `Batch "${batchNumber}" already exists for this product.`,
    );
  }
}

export async function assertProductExists(productId: string): Promise<void> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.isDeleted, false)))
    .limit(1);
  if (!row) throw errors.badRequest("Selected product does not exist");
}

/** Returns the supplier's company (needed for price history), or null when no supplier. */
export async function supplierCompany(supplierId: string | null): Promise<string | null> {
  if (!supplierId) return null;
  const [row] = await db
    .select({ companyId: suppliers.companyId })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.isDeleted, false)))
    .limit(1);
  if (!row) throw errors.badRequest("Selected supplier does not exist");
  return row.companyId;
}

/** Batch cost prices feed supplier price history (company comes from the supplier). */
export async function recordSupplierPrice(
  tx: Transaction,
  entry: {
    supplierId: string | null;
    supplierCompanyId: string | null;
    productId: string;
    costPrice: number | null;
    priceType: PriceType | null;
    batchNumber: string;
  },
): Promise<void> {
  if (!entry.supplierId || !entry.supplierCompanyId || entry.costPrice === null) return;
  await tx.insert(supplierPriceHistory).values({
    supplierId: entry.supplierId,
    productId: entry.productId,
    companyId: entry.supplierCompanyId,
    priceLkr: entry.costPrice.toFixed(2),
    priceType: entry.priceType,
    notes: `Batch ${entry.batchNumber}`,
  });
}

/** Read access to batches: these pages need batch data. */
export const BATCH_READ_ROUTES = ["/batches", "/products", "/quotations", "/invoices", "/reports"];

