import { appSchema } from "./app-schema";
import { date, index, integer, numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { invoices } from "./invoices";

export const packingLists = appSchema.table(
  "packing_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    shipmentReference: text("shipment_reference"), // e.g. "AIR SHIPMENT 02/APP/03/2026"
    totalCartons: text("total_cartons"),
    containerInfo: text("container_info"),
    grossWeightKg: numeric("gross_weight_kg", { precision: 10, scale: 2 }),
    netWeightKg: numeric("net_weight_kg", { precision: 10, scale: 2 }),
    cbm: numeric("cbm", { precision: 10, scale: 2 }),
    marks: text("marks"),
    date: date("date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("packing_lists_invoice_idx").on(t.invoiceId), index("packing_lists_company_idx").on(t.companyId)],
);

export const packingListItems = appSchema.table(
  "packing_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packingListId: uuid("packing_list_id")
      .notNull()
      .references(() => packingLists.id, { onDelete: "cascade" }),
    cartonStart: integer("carton_start"),
    cartonEnd: integer("carton_end"),
    description: text("description"),
    packingDetails: text("packing_details"), // free-text formula: "(10X1)X10CTN=100 CTN"
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("packing_list_items_list_idx").on(t.packingListId)],
);
