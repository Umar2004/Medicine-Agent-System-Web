import { appSchema } from "./app-schema";
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { PRICE_TYPES } from "../../lib/constants";
import { products } from "./products";
import { suppliers } from "./suppliers";

/** SHARED — no company_id, no selling price (cost only). */
export const productBatches = appSchema.table(
  "product_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchNumber: text("batch_number").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    mfd: text("mfd"), // MM/YYYY
    exp: text("exp"), // MM/YYYY
    stockQuantity: integer("stock_quantity").notNull(),
    costPrice: numeric("cost_price", { precision: 18, scale: 2 }), // LKR — what the company paid
    priceType: text("price_type", { enum: PRICE_TYPES }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [
    unique("product_batches_product_batch_uq").on(t.productId, t.batchNumber),
    check("product_batches_stock_non_negative", sql`${t.stockQuantity} >= 0`),
    index("product_batches_product_idx").on(t.productId),
  ],
);
