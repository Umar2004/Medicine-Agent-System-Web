import { appSchema } from "./app-schema";
import {
  boolean,
  index,
  integer,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { QUOTATION_STATUSES } from "../../lib/constants";
import { companyBankDetails } from "./bank-details";
import { companies } from "./companies";
import { customers } from "./customers";
import { orders } from "./orders";
import { products } from "./products";
import { users } from "./users";

export { QUOTATION_STATUSES };

const money = (name: string) => numeric(name, { precision: 18, scale: 2 });

/**
 * Quotations are exploratory price inquiries — kept out of `orders` so they never inflate
 * order/revenue metrics and never touch inventory. Accepted ones convert into a PI (order).
 */
export const quotations = appSchema.table(
  "quotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    quotationNumber: text("quotation_number").notNull(), // QT-{customerCode}-{seq}, e.g. QT-SFL-0001
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: text("status", { enum: QUOTATION_STATUSES }).notNull().default("draft"),

    // Optional sections — default OFF for quotations
    showFreight: boolean("show_freight").notNull().default(false),
    showBankDetails: boolean("show_bank_details").notNull().default(false),
    showOtherDetails: boolean("show_other_details").notNull().default(false),

    // Freight / C&F (meaningful only when showFreight)
    airFreight: money("air_freight").notNull().default("0"),
    handlingDocumentation: money("handling_documentation").notNull().default("0"),
    totalCnf: money("total_cnf").notNull().default("0"),
    cnfDestination: text("cnf_destination"),
    shippingType: text("shipping_type"),

    // Display options
    showMfd: boolean("show_mfd").notNull().default(true),
    showExp: boolean("show_exp").notNull().default(true),
    showGenericName: boolean("show_generic_name").notNull().default(true),

    marks: text("marks"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    bankDetailId: uuid("bank_detail_id").references(() => companyBankDetails.id, { onDelete: "set null" }),

    rejectionReason: text("rejection_reason"),
    rejectedBy: uuid("rejected_by").references(() => users.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),

    revisionNumber: integer("revision_number").notNull().default(1),
    /** Last time it was marked as sent (re-sending a revision moves it forward). */
    sentAt: timestamp("sent_at", { withTimezone: true }),

    // Set when QT → PI
    convertedToOrderId: uuid("converted_to_order_id").references((): AnyPgColumn => orders.id),
    convertedAt: timestamp("converted_at", { withTimezone: true }),

    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [
    unique("quotations_company_number_uq").on(t.companyId, t.quotationNumber),
    index("quotations_company_status_idx").on(t.companyId, t.status),
    index("quotations_customer_idx").on(t.customerId),
  ],
);

export const quotationItems = appSchema.table(
  "quotation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    mfd: text("mfd"), // MM/YYYY, indicative only
    exp: text("exp"), // MM/YYYY, indicative only
    quantity: integer("quantity").notNull(),
    unit: text("unit"),
    sellingPriceUsd: money("selling_price_usd"),
    totalUsd: money("total_usd"),
    sortOrder: integer("sort_order").notNull().default(0),
    // NO batch_id — quotations never touch inventory
  },
  (t) => [
    index("quotation_items_quotation_idx").on(t.quotationId),
    index("quotation_items_product_idx").on(t.productId),
  ],
);
