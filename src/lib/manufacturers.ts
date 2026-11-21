import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { db, manufacturers, products } from "@/db";
import { errors } from "@/lib/api";

const productCounts = new QueryBuilder()
  .select({
    manufacturerId: products.manufacturerId,
    productCount: sql<number>`count(*)::int`.as("product_count"),
  })
  .from(products)
  .where(eq(products.isDeleted, false))
  .groupBy(products.manufacturerId)
  .as("manufacturer_products");

export const manufacturerColumns = {
  id: manufacturers.id,
  manufacturerNumber: manufacturers.manufacturerNumber,
  name: manufacturers.name,
  country: manufacturers.country,
  contactInfo: manufacturers.contactInfo,
  productCount: sql<number>`coalesce(${productCounts.productCount}, 0)`.mapWith(Number),
  createdAt: manufacturers.createdAt,
  updatedAt: manufacturers.updatedAt,
};

export function manufacturerQuery() {
  return db
    .select(manufacturerColumns)
    .from(manufacturers)
    .leftJoin(productCounts, eq(productCounts.manufacturerId, manufacturers.id));
}

export async function findManufacturer(id: string) {
  const [row] = await manufacturerQuery()
    .where(and(eq(manufacturers.id, id), eq(manufacturers.isDeleted, false)))
    .limit(1);
  return row ?? null;
}

export async function assertNoDuplicateManufacturer(name: string, excludeId?: string): Promise<void> {
  const [dup] = await db
    .select({ manufacturerNumber: manufacturers.manufacturerNumber })
    .from(manufacturers)
    .where(
      and(
        eq(manufacturers.isDeleted, false),
        sql`lower(${manufacturers.name}) = lower(${name})`,
        excludeId ? ne(manufacturers.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (dup) throw errors.conflict(`A manufacturer with this name already exists (${dup.manufacturerNumber})`);
}

export const MANUFACTURER_READ_ROUTES = ["/manufacturers", "/products", "/batches", "/reports"];
