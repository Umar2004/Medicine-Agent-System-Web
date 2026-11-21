import { appSchema } from "./app-schema";
import { boolean, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { manufacturers } from "./manufacturers";

/** SHARED — no company_id (one physical warehouse). */
export const products = appSchema.table(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productNumber: text("product_number").notNull().unique(), // PROD-0000001
    brandName: text("brand_name").notNull(),
    genericName: text("generic_name"),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id),
    unit: text("unit"), // 28's, 100's, etc.
    country: text("country"), // country of origin
    lowStockThreshold: integer("low_stock_threshold").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [index("products_manufacturer_idx").on(t.manufacturerId)],
);
