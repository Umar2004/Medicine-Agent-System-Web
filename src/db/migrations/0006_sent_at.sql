ALTER TABLE "app"."orders" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."quotations" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
-- Backfill from the audit trail: the last "sent" event for documents that have been sent at least once.
UPDATE "app"."quotations" q SET "sent_at" = l.sent_at
FROM (SELECT entity_id, max(created_at) AS sent_at FROM "app"."user_logs" WHERE action_type = 'QuotationSent' GROUP BY entity_id) l
WHERE l.entity_id = q.id::text AND q.status <> 'draft';--> statement-breakpoint
UPDATE "app"."orders" o SET "sent_at" = l.sent_at
FROM (SELECT entity_id, max(created_at) AS sent_at FROM "app"."user_logs" WHERE action_type = 'ProformaInvoiceSent' GROUP BY entity_id) l
WHERE l.entity_id = o.id::text AND o.status <> 'draft';