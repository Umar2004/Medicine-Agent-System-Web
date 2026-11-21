CREATE TABLE "app"."quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"mfd" text,
	"exp" text,
	"quantity" integer NOT NULL,
	"unit" text,
	"selling_price_usd" numeric(18, 2),
	"total_usd" numeric(18, 2),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quotation_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"show_freight" boolean DEFAULT false NOT NULL,
	"show_bank_details" boolean DEFAULT false NOT NULL,
	"show_other_details" boolean DEFAULT false NOT NULL,
	"air_freight" numeric(18, 2) DEFAULT '0' NOT NULL,
	"handling_documentation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_cnf" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cnf_destination" text,
	"shipping_type" text,
	"show_mfd" boolean DEFAULT true NOT NULL,
	"show_exp" boolean DEFAULT true NOT NULL,
	"show_generic_name" boolean DEFAULT true NOT NULL,
	"marks" text,
	"payment_terms" text,
	"notes" text,
	"bank_detail_id" uuid,
	"rejection_reason" text,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"converted_to_order_id" uuid,
	"converted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "quotations_company_number_uq" UNIQUE("company_id","quotation_number")
);
--> statement-breakpoint
CREATE TABLE "app"."document_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" text NOT NULL,
	"document_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_summary" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_revisions_doc_rev_uq" UNIQUE("document_type","document_id","revision_number")
);
--> statement-breakpoint
ALTER TABLE "app"."orders" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."orders" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "document_type" text DEFAULT 'proforma_invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "show_freight" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "show_bank_details" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "show_other_details" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "revision_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "converted_from_quotation_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD COLUMN "section_enforcement" jsonb;--> statement-breakpoint
ALTER TABLE "app"."quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "app"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quotation_items" ADD CONSTRAINT "quotation_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quotations" ADD CONSTRAINT "quotations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "app"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quotations" ADD CONSTRAINT "quotations_bank_detail_id_company_bank_details_id_fk" FOREIGN KEY ("bank_detail_id") REFERENCES "app"."company_bank_details"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quotations" ADD CONSTRAINT "quotations_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quotations" ADD CONSTRAINT "quotations_converted_to_order_id_orders_id_fk" FOREIGN KEY ("converted_to_order_id") REFERENCES "app"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_revisions" ADD CONSTRAINT "document_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotation_items_quotation_idx" ON "app"."quotation_items" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "quotation_items_product_idx" ON "app"."quotation_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "quotations_company_status_idx" ON "app"."quotations" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "quotations_customer_idx" ON "app"."quotations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "document_revisions_doc_idx" ON "app"."document_revisions" USING btree ("document_type","document_id");--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_converted_from_quotation_id_quotations_id_fk" FOREIGN KEY ("converted_from_quotation_id") REFERENCES "app"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_company_doctype_idx" ON "app"."orders" USING btree ("company_id","document_type");--> statement-breakpoint
CREATE INDEX "orders_source_quotation_idx" ON "app"."orders" USING btree ("converted_from_quotation_id");--> statement-breakpoint
-- Default grants for the two new PI permission keys only (existing, possibly customized grants are untouched).
INSERT INTO "app"."role_function_permissions" ("role", "permission_key") VALUES
	('admin', 'manage_proforma_invoices'),
	('admin', 'approve_proforma_invoices'),
	('manager', 'manage_proforma_invoices'),
	('manager', 'approve_proforma_invoices'),
	('office_staff', 'manage_proforma_invoices')
ON CONFLICT ("role", "permission_key") DO NOTHING;
