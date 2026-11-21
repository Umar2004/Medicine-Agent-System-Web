-- Phase 11: move legacy unified-model data into the QT → PI → CI pipeline.
-- Runs inside the migrator's transaction; IDs and numbers are kept so links and audit entries stay valid.

-- 1. Legacy quotations (orders.type = 'quotation') → app.quotations.
--    Status: approved → accepted, cancelled → rejected, sent back for revision → negotiating,
--    marked as sent → sent, otherwise draft. All sections ON so they print as they always did.
INSERT INTO "app"."quotations" (
	"id", "company_id", "quotation_number", "customer_id", "status",
	"show_freight", "show_bank_details", "show_other_details",
	"air_freight", "handling_documentation", "total_cnf", "cnf_destination", "shipping_type",
	"show_mfd", "show_exp", "show_generic_name", "marks", "payment_terms", "notes", "bank_detail_id",
	"rejection_reason", "rejected_by", "rejected_at", "revision_number",
	"created_by", "created_at", "updated_at", "is_deleted"
)
SELECT
	o."id", o."company_id", o."order_number", o."customer_id",
	CASE
		WHEN o."status" = 'approved' THEN 'accepted'
		WHEN o."status" = 'cancelled' THEN 'rejected'
		WHEN o."rejection_reason" IS NOT NULL THEN 'negotiating'
		WHEN o."proforma_sent_at" IS NOT NULL THEN 'sent'
		ELSE 'draft'
	END,
	true, true, true,
	o."air_freight", o."handling_documentation", o."total_cnf", o."cnf_destination", o."shipping_type",
	o."show_mfd", o."show_exp", o."show_generic_name", o."marks", o."payment_terms", o."notes", o."bank_detail_id",
	o."rejection_reason", o."rejected_by", o."rejected_at", 1,
	o."created_by", o."created_at", o."updated_at", o."is_deleted"
FROM "app"."orders" o
WHERE o."type" = 'quotation'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app"."quotation_items" (
	"id", "quotation_id", "product_id", "mfd", "exp", "quantity", "unit", "selling_price_usd", "total_usd", "sort_order"
)
SELECT i."id", i."order_id", i."product_id", i."mfd", i."exp", i."quantity", i."unit",
	i."selling_price_usd", i."total_usd", i."sort_order"
FROM "app"."order_items" i
JOIN "app"."orders" o ON o."id" = i."order_id"
WHERE o."type" = 'quotation'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Remove the moved rows from orders (items cascade). Only rows now present in quotations and not
-- referenced by an invoice; the check below aborts the migration if anything is left behind.
DELETE FROM "app"."orders" o
WHERE o."type" = 'quotation'
	AND EXISTS (SELECT 1 FROM "app"."quotations" q WHERE q."id" = o."id")
	AND NOT EXISTS (SELECT 1 FROM "app"."invoices" v WHERE v."order_id" = o."id")
	AND NOT EXISTS (SELECT 1 FROM "app"."orders" s WHERE s."source_order_id" = o."id");
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "app"."orders" WHERE "type" = 'quotation') THEN
		RAISE EXCEPTION 'Phase 11: some legacy quotations could not be moved out of app.orders (referenced by an invoice or another order)';
	END IF;
END $$;
--> statement-breakpoint
-- 2. Remaining orders are real business. Map legacy statuses onto the PI flow…
UPDATE "app"."orders" SET "status" = 'confirmed' WHERE "status" = 'approved';
--> statement-breakpoint
UPDATE "app"."orders" SET "status" = 'draft' WHERE "status" = 'pending';
--> statement-breakpoint
-- …and mark those that reached invoicing as commercial invoices (cancelling an invoice reverts this).
UPDATE "app"."orders"
SET "document_type" = CASE WHEN "status" IN ('invoiced', 'completed') THEN 'commercial_invoice' ELSE 'proforma_invoice' END;
