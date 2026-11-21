ALTER TABLE "app"."orders" DROP CONSTRAINT "orders_source_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "app"."orders" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "app"."orders" DROP COLUMN "source_order_id";--> statement-breakpoint
ALTER TABLE "app"."orders" DROP COLUMN "proforma_sent_at";