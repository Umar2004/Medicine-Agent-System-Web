import { appSchema } from "./app-schema";
import { boolean, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

export const signatures = appSchema.table(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    label: text("label").notNull(), // e.g. 'Director', 'Manager'
    imageUrl: text("image_url").notNull(), // Supabase Storage path/URL
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [index("signatures_company_user_idx").on(t.companyId, t.userId)],
);
