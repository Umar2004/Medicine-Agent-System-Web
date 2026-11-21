import { appSchema } from "./app-schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { ROLES, USER_STATUSES } from "../../lib/constants";
import { companies } from "./companies";

export const users = appSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    role: text("role", { enum: ROLES }).notNull().default("staff"),
    status: text("status", { enum: USER_STATUSES }).notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Access tokens issued before this are rejected (password change / admin reset). */
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (t) => [uniqueIndex("users_username_lower_uq").on(sql`lower(${t.username})`)],
);

export const refreshTokens = appSchema.table(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(), // SHA-256 of plaintext
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id").references((): AnyPgColumn => refreshTokens.id),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refresh_tokens_token_hash_idx").on(t.tokenHash), index("refresh_tokens_user_idx").on(t.userId)],
);

export const userCompanyAccess = appSchema.table(
  "user_company_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [unique("user_company_access_user_company_uq").on(t.userId, t.companyId)],
);
