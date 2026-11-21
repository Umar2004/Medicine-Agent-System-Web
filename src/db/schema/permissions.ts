import { appSchema } from "./app-schema";
import { boolean, integer, text, unique, uuid } from "drizzle-orm/pg-core";
import { PERMISSION_KEYS, ROLES } from "../../lib/constants";

/** FunctionKey permissions (replaces the old permissions.json file). */
export const roleFunctionPermissions = appSchema.table(
  "role_function_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role", { enum: ROLES }).notNull(),
    permissionKey: text("permission_key", { enum: PERMISSION_KEYS }).notNull(),
  },
  (t) => [unique("role_function_permissions_role_key_uq").on(t.role, t.permissionKey)],
);

/** Sidebar modules. */
export const dashboardModules = appSchema.table("dashboard_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  icon: text("icon"),
  route: text("route").unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
});

/** Sidebar visibility per role. */
export const rolePermissions = appSchema.table(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role", { enum: ROLES }).notNull(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => dashboardModules.id, { onDelete: "cascade" }),
  },
  (t) => [unique("role_permissions_role_module_uq").on(t.role, t.moduleId)],
);
