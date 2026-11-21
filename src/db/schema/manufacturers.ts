import { appSchema } from "./app-schema";
import { boolean, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** SHARED — no company_id. */
export const manufacturers = appSchema.table("manufacturers", {
  id: uuid("id").primaryKey().defaultRandom(),
  manufacturerNumber: text("manufacturer_number").notNull().unique(), // MFG-00000001
  name: text("name").notNull(),
  country: text("country"),
  contactInfo: text("contact_info"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
