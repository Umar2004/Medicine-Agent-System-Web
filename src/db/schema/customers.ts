import { appSchema } from "./app-schema";
import { boolean, index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const customers = appSchema.table(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    customerNumber: text("customer_number").notNull(), // CUSTOMER-0000001
    code: text("code").notNull(), // short code used in invoice numbers, e.g. 'SFL'
    name: text("name").notNull(),
    businessName: text("business_name"),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [
    unique("customers_company_number_uq").on(t.companyId, t.customerNumber),
    unique("customers_company_code_uq").on(t.companyId, t.code),
    index("customers_company_idx").on(t.companyId),
  ],
);
