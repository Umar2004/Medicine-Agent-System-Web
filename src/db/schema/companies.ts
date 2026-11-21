import { appSchema } from "./app-schema";
import { boolean, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const companies = appSchema.table("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  taxId: text("tax_id"),
  currency: text("currency").notNull().default("USD"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
