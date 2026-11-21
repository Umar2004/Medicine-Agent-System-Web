import { appSchema } from "./app-schema";
import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

/** company_id is nullable — login/logout events have no company. */
export const userLogs = appSchema.table(
  "user_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    username: text("username"),
    companyId: uuid("company_id").references(() => companies.id),
    actionType: text("action_type").notNull(),
    entityName: text("entity_name"),
    entityId: text("entity_id"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    page: text("page"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_logs_created_idx").on(t.createdAt),
    index("user_logs_company_idx").on(t.companyId),
    index("user_logs_user_idx").on(t.userId),
  ],
);
