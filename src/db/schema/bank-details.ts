import { appSchema } from "./app-schema";
import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";

/** HARD DELETE only — no is_deleted column (CLAUDE.md §7.4). */
export const companyBankDetails = appSchema.table(
  "company_bank_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    bankName: text("bank_name").notNull(),
    accountNumber: text("account_number").notNull(),
    swiftCode: text("swift_code"),
    branchName: text("branch_name"),
    otherDetails: text("other_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("company_bank_details_company_idx").on(t.companyId)],
);
