-- Phase 6: "Orders" sidebar module (PIs + CIs) between Quotations and Invoices.
-- Only adds the new module and its default visibility; existing (possibly owner-customised)
-- role → module links are left untouched.
INSERT INTO "app"."dashboard_modules" ("title", "icon", "route", "sort_order", "is_active", "is_default")
VALUES ('Orders', 'ClipboardList', '/orders', 5, true, false)
ON CONFLICT ("route") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon";
--> statement-breakpoint
-- Re-number sort_order to match NAV_ITEMS in src/lib/navigation.ts.
UPDATE "app"."dashboard_modules" AS m
SET "sort_order" = v.sort_order
FROM (VALUES
	('/dashboard', 0), ('/products', 1), ('/batches', 2), ('/manufacturers', 3), ('/quotations', 4),
	('/orders', 5), ('/invoices', 6), ('/packing', 7), ('/customers', 8), ('/suppliers', 9),
	('/bank-accounts', 10), ('/supplier-prices', 11), ('/reports', 12), ('/users', 13), ('/roles', 14),
	('/audit-log', 15), ('/companies', 16), ('/settings', 17)
) AS v(route, sort_order)
WHERE m."route" = v.route;
--> statement-breakpoint
-- Default /orders visibility (DEFAULT_ROLE_MODULES). Staff don't get it by default.
INSERT INTO "app"."role_permissions" ("role", "module_id")
SELECT r.role, m."id"
FROM "app"."dashboard_modules" m
CROSS JOIN (VALUES ('admin'), ('manager'), ('office_staff'), ('warehouse_staff')) AS r(role)
WHERE m."route" = '/orders'
ON CONFLICT ("role", "module_id") DO NOTHING;
