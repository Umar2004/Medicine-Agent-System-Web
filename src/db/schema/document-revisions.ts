import { appSchema } from "./app-schema";
import { index, integer, jsonb, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { REVISION_DOCUMENT_TYPES } from "../../lib/constants";
import { users } from "./users";

/**
 * Version history for quotations and PIs. `document_id` is polymorphic (quotations.id or
 * orders.id, per `document_type`), so it has no FK. Company scoping comes from the parent document.
 */
export const documentRevisions = appSchema.table(
  "document_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentType: text("document_type", { enum: REVISION_DOCUMENT_TYPES }).notNull(),
    documentId: uuid("document_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(), // document + items at this revision
    changeSummary: text("change_summary"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("document_revisions_doc_rev_uq").on(t.documentType, t.documentId, t.revisionNumber),
    index("document_revisions_doc_idx").on(t.documentType, t.documentId),
  ],
);
