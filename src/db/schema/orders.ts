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
import { ORDER_DOCUMENT_TYPES, ORDER_STATUSES } from "../../lib/constants";
import { companyBankDetails } from "./bank-details";
import { productBatches } from "./batches";
import { companies } from "./companies";
import { customers } from "./customers";
import { products } from "./products";
import { quotations } from "./quotations";
import { users } from "./users";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 });

export const orders = appSchema.table(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    orderNumber: text("order_number").notNull(), // PI-{customerCode}-{seq}; legacy rows keep QUOT-0000001
    documentType: text("document_type", { enum: ORDER_DOCUMENT_TYPES }).notNull().default("proforma_invoice"),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("draft"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    airFreight: money("air_freight").notNull().default("0"),
    handlingDocumentation: money("handling_documentation").notNull().default("0"),
    totalCnf: money("total_cnf").notNull().default("0"),
    cnfDestination: text("cnf_destination"),
    showMfd: boolean("show_mfd").notNull().default(true),
    showExp: boolean("show_exp").notNull().default(true),
    showGenericName: boolean("show_generic_name").notNull().default(true),
    // Optional sections — default ON for PIs (a CI forces any that were OFF back on)
    showFreight: boolean("show_freight").notNull().default(true),
    showBankDetails: boolean("show_bank_details").notNull().default(true),
    showOtherDetails: boolean("show_other_details").notNull().default(true),
    shippingType: text("shipping_type"),
    marks: text("marks"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    bankDetailId: uuid("bank_detail_id").references(() => companyBankDetails.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    rejectedBy: uuid("rejected_by").references(() => users.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    revisionNumber: integer("revision_number").notNull().default(1),
    /** Last time the PI was marked as sent (re-sending a revision moves it forward). */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    convertedFromQuotationId: uuid("converted_from_quotation_id").references((): AnyPgColumn => quotations.id),
    createdBy: uuid("created_by").references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [
    unique("orders_company_number_uq").on(t.companyId, t.orderNumber),
    index("orders_company_status_idx").on(t.companyId, t.status),
    index("orders_customer_idx").on(t.customerId),
    index("orders_company_doctype_idx").on(t.companyId, t.documentType),
    index("orders_source_quotation_idx").on(t.convertedFromQuotationId),
  ],
);

export const orderItems = appSchema.table(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    mfd: text("mfd"), // MM/YYYY, typed manually
    exp: text("exp"), // MM/YYYY, typed manually
    quantity: integer("quantity").notNull(),
    unit: text("unit"),
    sellingPriceUsd: money("selling_price_usd"),
    totalUsd: money("total_usd"),
    batchId: uuid("batch_id").references(() => productBatches.id), // NULL at quotation stage
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
);
