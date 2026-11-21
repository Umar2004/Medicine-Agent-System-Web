CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"tax_id" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."user_company_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_company_access_user_company_uq" UNIQUE("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "app"."dashboard_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"icon" text,
	"route" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dashboard_modules_route_unique" UNIQUE("route")
);
--> statement-breakpoint
CREATE TABLE "app"."role_function_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_function_permissions_role_key_uq" UNIQUE("role","permission_key")
);
--> statement-breakpoint
CREATE TABLE "app"."role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"module_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_module_uq" UNIQUE("role","module_id")
);
--> statement-breakpoint
CREATE TABLE "app"."company_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"swift_code" text,
	"branch_name" text,
	"other_details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"image_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."manufacturers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_number" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"contact_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "manufacturers_manufacturer_number_unique" UNIQUE("manufacturer_number")
);
--> statement-breakpoint
CREATE TABLE "app"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_number" text NOT NULL,
	"brand_name" text NOT NULL,
	"generic_name" text,
	"manufacturer_id" uuid,
	"unit" text,
	"country" text,
	"low_stock_threshold" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "products_product_number_unique" UNIQUE("product_number")
);
--> statement-breakpoint
CREATE TABLE "app"."supplier_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"price_lkr" numeric(18, 2),
	"price_type" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "app"."suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_number" text NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"contact_number" text,
	"email" text,
	"address" text,
	"city" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "suppliers_company_number_uq" UNIQUE("company_id","supplier_number")
);
--> statement-breakpoint
CREATE TABLE "app"."product_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" text NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_id" uuid,
	"mfd" text,
	"exp" text,
	"stock_quantity" integer NOT NULL,
	"cost_price" numeric(18, 2),
	"price_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_batches_product_batch_uq" UNIQUE("product_id","batch_number"),
	CONSTRAINT "product_batches_stock_non_negative" CHECK ("app"."product_batches"."stock_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_number" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"business_name" text,
	"contact_person" text,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "customers_company_number_uq" UNIQUE("company_id","customer_number"),
	CONSTRAINT "customers_company_code_uq" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "app"."order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"mfd" text,
	"exp" text,
	"quantity" integer NOT NULL,
	"unit" text,
	"selling_price_usd" numeric(18, 2),
	"total_usd" numeric(18, 2),
	"batch_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"customer_id" uuid NOT NULL,
	"air_freight" numeric(18, 2) DEFAULT '0' NOT NULL,
	"handling_documentation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_cnf" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cnf_destination" text,
	"show_mfd" boolean DEFAULT true NOT NULL,
	"show_exp" boolean DEFAULT true NOT NULL,
	"show_generic_name" boolean DEFAULT true NOT NULL,
	"shipping_type" text,
	"marks" text,
	"payment_terms" text,
	"notes" text,
	"bank_detail_id" uuid,
	"rejection_reason" text,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"source_order_id" uuid,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"proforma_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "orders_company_number_uq" UNIQUE("company_id","order_number")
);
--> statement-breakpoint
CREATE TABLE "app"."invoice_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"file_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"mfd" text,
	"exp" text,
	"quantity" integer NOT NULL,
	"unit" text,
	"supplier_price_lkr" numeric(18, 2),
	"selling_price_usd" numeric(18, 2),
	"line_total" numeric(18, 2),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"order_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"air_freight" numeric(18, 2) DEFAULT '0' NOT NULL,
	"handling_documentation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_cnf" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cnf_destination" text,
	"total_amount_usd" numeric(18, 2),
	"amount_in_words" text,
	"shipping_type" text,
	"marks" text,
	"payment_terms" text,
	"consignee_name" text,
	"consignee_address" text,
	"consignee_country" text,
	"consignee_phone" text,
	"consignee_email" text,
	"notify_name" text,
	"notify_address" text,
	"notify_country" text,
	"notify_phone" text,
	"notify_contact_person" text,
	"ordering_name" text,
	"ordering_address" text,
	"ordering_country" text,
	"ordering_phone" text,
	"signature_id" uuid,
	"bank_detail_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "invoices_company_number_uq" UNIQUE("company_id","invoice_number")
);
--> statement-breakpoint
CREATE TABLE "app"."packing_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packing_list_id" uuid NOT NULL,
	"carton_start" integer,
	"carton_end" integer,
	"description" text,
	"packing_details" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."packing_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"shipment_reference" text,
	"total_cartons" text,
	"container_info" text,
	"gross_weight_kg" numeric(10, 2),
	"net_weight_kg" numeric(10, 2),
	"cbm" numeric(10, 2),
	"marks" text,
	"date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."user_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"username" text,
	"company_id" uuid,
	"action_type" text NOT NULL,
	"entity_name" text,
	"entity_id" text,
	"old_value" text,
	"new_value" text,
	"ip_address" text,
	"user_agent" text,
	"page" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_refresh_tokens_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "app"."refresh_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_company_access" ADD CONSTRAINT "user_company_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_company_access" ADD CONSTRAINT "user_company_access_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_module_id_dashboard_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "app"."dashboard_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."company_bank_details" ADD CONSTRAINT "company_bank_details_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signatures" ADD CONSTRAINT "signatures_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signatures" ADD CONSTRAINT "signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."products" ADD CONSTRAINT "products_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "app"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_price_history" ADD CONSTRAINT "supplier_price_history_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "app"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_price_history" ADD CONSTRAINT "supplier_price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_price_history" ADD CONSTRAINT "supplier_price_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_batches" ADD CONSTRAINT "product_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_batches" ADD CONSTRAINT "product_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "app"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "app"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "app"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_bank_detail_id_company_bank_details_id_fk" FOREIGN KEY ("bank_detail_id") REFERENCES "app"."company_bank_details"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_source_order_id_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "app"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoice_files" ADD CONSTRAINT "invoice_files_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoice_items" ADD CONSTRAINT "invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoice_items" ADD CONSTRAINT "invoice_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "app"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_signature_id_signatures_id_fk" FOREIGN KEY ("signature_id") REFERENCES "app"."signatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_bank_detail_id_company_bank_details_id_fk" FOREIGN KEY ("bank_detail_id") REFERENCES "app"."company_bank_details"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."packing_list_items" ADD CONSTRAINT "packing_list_items_packing_list_id_packing_lists_id_fk" FOREIGN KEY ("packing_list_id") REFERENCES "app"."packing_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."packing_lists" ADD CONSTRAINT "packing_lists_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."packing_lists" ADD CONSTRAINT "packing_lists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_logs" ADD CONSTRAINT "user_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_logs" ADD CONSTRAINT "user_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_tokens_token_hash_idx" ON "app"."refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "app"."refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "app"."users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "company_bank_details_company_idx" ON "app"."company_bank_details" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "signatures_company_user_idx" ON "app"."signatures" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "products_manufacturer_idx" ON "app"."products" USING btree ("manufacturer_id");--> statement-breakpoint
CREATE INDEX "supplier_price_history_product_idx" ON "app"."supplier_price_history" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "supplier_price_history_company_idx" ON "app"."supplier_price_history" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "suppliers_company_idx" ON "app"."suppliers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "product_batches_product_idx" ON "app"."product_batches" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "customers_company_idx" ON "app"."customers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "app"."order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "app"."order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_company_status_idx" ON "app"."orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "app"."orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "app"."invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_company_status_idx" ON "app"."invoices" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "app"."invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "packing_list_items_list_idx" ON "app"."packing_list_items" USING btree ("packing_list_id");--> statement-breakpoint
CREATE INDEX "packing_lists_invoice_idx" ON "app"."packing_lists" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "packing_lists_company_idx" ON "app"."packing_lists" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "user_logs_created_idx" ON "app"."user_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_logs_company_idx" ON "app"."user_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "user_logs_user_idx" ON "app"."user_logs" USING btree ("user_id");