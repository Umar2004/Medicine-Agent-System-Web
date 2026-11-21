import { appSchema } from "./app-schema";
import { boolean, index, integer, jsonb, numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { INVOICE_STATUSES, type SectionEnforcement } from "../../lib/constants";
import { companyBankDetails } from "./bank-details";
import { productBatches } from "./batches";
import { companies } from "./companies";
import { orders } from "./orders";
import { products } from "./products";
import { signatures } from "./signatures";
import { users } from "./users";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 });

export const invoices = appSchema.table(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    invoiceNumber: text("invoice_number").notNull(), // {seq}/{customerCode}/{MM}/{YYYY}
    orderId: uuid("order_id").references(() => orders.id),
    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("draft"),
    airFreight: money("air_freight").notNull().default("0"),
    handlingDocumentation: money("handling_documentation").notNull().default("0"),
    totalCnf: money("total_cnf").notNull().default("0"),
    cnfDestination: text("cnf_destination"),
    totalAmountUsd: money("total_amount_usd"),
    amountInWords: text("amount_in_words"),
    shippingType: text("shipping_type"),
    marks: text("marks"),
    paymentTerms: text("payment_terms"),
    consigneeName: text("consignee_name"),
    consigneeAddress: text("consignee_address"),
    consigneeCountry: text("consignee_country"),
    consigneePhone: text("consignee_phone"),
    consigneeEmail: text("consignee_email"),
    notifyName: text("notify_name"),
    notifyAddress: text("notify_address"),
    notifyCountry: text("notify_country"),
    notifyPhone: text("notify_phone"),
    notifyContactPerson: text("notify_contact_person"),
    orderingName: text("ordering_name"),
    orderingAddress: text("ordering_address"),
    orderingCountry: text("ordering_country"),
    orderingPhone: text("ordering_phone"),
    signatureId: uuid("signature_id").references(() => signatures.id),
    bankDetailId: uuid("bank_detail_id").references(() => companyBankDetails.id, { onDelete: "set null" }),
    notes: text("notes"),
    // Sections the source PI had OFF that this CI must show, e.g. {"freight": true}. Set at CI creation.
    sectionEnforcement: jsonb("section_enforcement").$type<SectionEnforcement>(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [
    unique("invoices_company_number_uq").on(t.companyId, t.invoiceNumber),
    index("invoices_company_status_idx").on(t.companyId, t.status),
    index("invoices_order_idx").on(t.orderId),
  ],
);

export const invoiceItems = appSchema.table(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    batchId: uuid("batch_id").references(() => productBatches.id),
    mfd: text("mfd"), // from the assigned batch
    exp: text("exp"), // from the assigned batch
    quantity: integer("quantity").notNull(),
    unit: text("unit"),
    supplierPriceLkr: money("supplier_price_lkr"),
    sellingPriceUsd: money("selling_price_usd"),
    lineTotal: money("line_total"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const invoiceFiles = appSchema.table("invoice_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id),
  filePath: text("file_path").notNull(),
  fileType: text("file_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
