ALTER TABLE "app"."orders" ADD COLUMN "consignee_name" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "consignee_address" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "consignee_country" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "consignee_phone" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "consignee_email" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "notify_name" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "notify_address" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "notify_country" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "notify_phone" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "notify_contact_person" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "ordering_name" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "ordering_address" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "ordering_country" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "ordering_phone" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "signature_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_signature_id_signatures_id_fk" FOREIGN KEY ("signature_id") REFERENCES "app"."signatures"("id") ON DELETE no action ON UPDATE no action;
