import { z } from "zod";
import { ORDER_DOCUMENT_TYPES, ORDER_STATUSES } from "../constants";
import { documentFieldsSchema, sectionTogglesSchema } from "./quotations";
import { optionalEmail, optionalText, optionalUuid } from "./common";

/** Optional consignee / notify / ordering party + signature fields on the PI. */
export const partyFieldsSchema = z.object({
  consigneeName: optionalText(200),
  consigneeAddress: optionalText(500),
  consigneeCountry: optionalText(100),
  consigneePhone: optionalText(50),
  consigneeEmail: optionalEmail,
  notifyName: optionalText(200),
  notifyAddress: optionalText(500),
  notifyCountry: optionalText(100),
  notifyPhone: optionalText(50),
  notifyContactPerson: optionalText(200),
  orderingName: optionalText(200),
  orderingAddress: optionalText(500),
  orderingCountry: optionalText(100),
  orderingPhone: optionalText(50),
  signatureId: optionalUuid("Select a valid signature"),
});
export type PartyFieldsInput = z.infer<typeof partyFieldsSchema>;

/** Create + update a proforma invoice directly (no quotation). Forms start with all sections ON. */
export const createProformaSchema = documentFieldsSchema
  .extend(sectionTogglesSchema.shape)
  .extend(partyFieldsSchema.shape);
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
