import { appSchema } from "./app-schema";
import { boolean, index, numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { PRICE_TYPES } from "../../lib/constants";
import { companies } from "./companies";
import { products } from "./products";

export const suppliers = appSchema.table(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    supplierNumber: text("supplier_number").notNull(), // SUPP-0000001
    name: text("name").notNull(),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    contactNumber: text("contact_number"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [
    unique("suppliers_company_number_uq").on(t.companyId, t.supplierNumber),
    index("suppliers_company_idx").on(t.companyId),
  ],
);

/** Recorded automatically from batch create/update; company comes from the supplier. */
export const supplierPriceHistory = appSchema.table(
  "supplier_price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    priceLkr: numeric("price_lkr", { precision: 18, scale: 2 }),
    priceType: text("price_type", { enum: PRICE_TYPES }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (t) => [
    index("supplier_price_history_product_idx").on(t.productId),
    index("supplier_price_history_company_idx").on(t.companyId),
  ],
);
