import { z } from "zod";
import { ORDER_DOCUMENT_TYPES, ORDER_STATUSES } from "../constants";
import { documentFieldsSchema, sectionTogglesSchema } from "./quotations";

/** Create + update a proforma invoice directly (no quotation). Forms start with all sections ON. */
export const createProformaSchema = documentFieldsSchema.extend(sectionTogglesSchema.shape);
export type ProformaInput = z.infer<typeof createProformaSchema>;

export const assignBatchesSchema = z.object({
  allocations: z
    .array(
      z.object({
        orderItemId: z.uuid(),
        batches: z
          .array(
            z.object({
              batchId: z.uuid(),
              quantity: z.number().int().min(1).max(100_000_000),
            }),
          )
          .min(1, "Every line needs at least one batch"),
      }),
    )
    .min(1),
});
export type AssignBatchesInput = z.infer<typeof assignBatchesSchema>;

export const ORDER_SORT_FIELDS = ["orderNumber", "customerName", "status", "documentType", "totalCnf", "createdAt"] as const;
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];

export const orderStatusParam = z.enum(ORDER_STATUSES);
export const orderDocumentTypeParam = z.enum(ORDER_DOCUMENT_TYPES);
