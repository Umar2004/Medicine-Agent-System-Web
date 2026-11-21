import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { db, manufacturers, productBatches, products } from "@/db";
import { errors } from "@/lib/api";

/** Total stock per product across all non-deleted batches (CLAUDE.md §7.9). */
export const productStock = new QueryBuilder()
  .select({
    productId: productBatches.productId,
    totalStock: sql<number>`coalesce(sum(${productBatches.stockQuantity}), 0)::int`.as("total_stock"),
    batchCount: sql<number>`count(*)::int`.as("batch_count"),
  })
  .from(productBatches)
  .where(eq(productBatches.isDeleted, false))
  .groupBy(productBatches.productId)
  .as("product_stock");

export const productListColumns = {
  id: products.id,
  productNumber: products.productNumber,
  brandName: products.brandName,
  genericName: products.genericName,
  manufacturerId: products.manufacturerId,
  manufacturerName: manufacturers.name,
  unit: products.unit,
  country: products.country,
  lowStockThreshold: products.lowStockThreshold,
  totalStock: sql<number>`coalesce(${productStock.totalStock}, 0)`.mapWith(Number),
  batchCount: sql<number>`coalesce(${productStock.batchCount}, 0)`.mapWith(Number),
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

export async function findProduct(id: string) {
  const [row] = await db
    .select(productListColumns)
    .from(products)
    .leftJoin(manufacturers, eq(manufacturers.id, products.manufacturerId))
    .leftJoin(productStock, eq(productStock.productId, products.id))
    .where(and(eq(products.id, id), eq(products.isDeleted, false)))
    .limit(1);
  return row ?? null;
}

/** Duplicate rule (CLAUDE.md §7.7): same brand name + same manufacturer → blocked. */
export async function assertNoDuplicateProduct(
  brandName: string,
  manufacturerId: string | null,
  excludeId?: string,
): Promise<void> {
  const [dup] = await db
    .select({ id: products.id, productNumber: products.productNumber })
    .from(products)
    .where(
      and(
        eq(products.isDeleted, false),
        sql`lower(${products.brandName}) = lower(${brandName})`,
        manufacturerId ? eq(products.manufacturerId, manufacturerId) : sql`${products.manufacturerId} is null`,
        excludeId ? ne(products.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (dup) {
    throw errors.conflict(`A product with this brand name and manufacturer already exists (${dup.productNumber})`);
  }
}

export async function assertManufacturerExists(manufacturerId: string | null): Promise<void> {
  if (!manufacturerId) return;
  const [row] = await db
    .select({ id: manufacturers.id })
    .from(manufacturers)
    .where(and(eq(manufacturers.id, manufacturerId), eq(manufacturers.isDeleted, false)))
    .limit(1);
  if (!row) throw errors.badRequest("Selected manufacturer does not exist");
}

/** Read access: products are used by these pages' workflows. */
export const PRODUCT_READ_ROUTES = ["/products", "/batches", "/quotations", "/invoices", "/supplier-prices", "/reports"];
