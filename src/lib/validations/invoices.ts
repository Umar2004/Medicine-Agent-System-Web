import { z } from "zod";
import { DOCUMENT_SECTIONS, type DocumentSection, type SectionEnforcement } from "../constants";
import { optionalEmail, optionalText, optionalUuid } from "./common";

/** Editable while draft. Items and charges are an exact copy of the order (CLAUDE.md §7.12). */
export const invoiceUpdateSchema = z.object({
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
  cnfDestination: optionalText(100),
  marks: optionalText(500),
  paymentTerms: optionalText(500),
  notes: optionalText(2000),
  bankDetailId: optionalUuid("Select a valid bank account"),
  signatureId: optionalUuid("Select a valid signature"),
});
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;

export const sectionEnforcementSchema = z.partialRecord(z.enum(DOCUMENT_SECTIONS), z.boolean());

/**
 * Field that must be filled on a Commercial Invoice for each section the source PI had OFF.
 * A CI always shows all sections; enforced ones cannot be left empty (spec 6.3 / 7.3).
 */
export const ENFORCED_SECTION_FIELDS: Record<DocumentSection, { field: keyof InvoiceUpdateInput; label: string }> = {
  freight: { field: "cnfDestination", label: "C&F destination" },
  bank_details: { field: "bankDetailId", label: "Bank account" },
  other_details: { field: "paymentTerms", label: "Payment terms" },
};

/** Enforced sections whose required field is blank. Shared by the CI form and the server. */
export function missingEnforcedSections(
  enforcement: SectionEnforcement | null | undefined,
  values: { cnfDestination?: string | null; bankDetailId?: string | null; paymentTerms?: string | null },
): { section: DocumentSection; field: keyof InvoiceUpdateInput; label: string }[] {
  if (!enforcement) return [];
  return DOCUMENT_SECTIONS.filter((section) => enforcement[section]).flatMap((section) => {
    const { field, label } = ENFORCED_SECTION_FIELDS[section];
    const value = values[field as "cnfDestination" | "bankDetailId" | "paymentTerms"];
    return value?.trim() ? [] : [{ section, field, label }];
  });
}

export const invoiceCancelSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(1000),
});

export const INVOICE_SORT_FIELDS = ["invoiceNumber", "customerName", "status", "totalAmountUsd", "createdAt"] as const;
export type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];
