import { z } from "zod";
import { QUOTATION_STATUSES } from "../constants";
import { monthIndex, MONTH_YEAR_RE } from "./batches";
import { optionalText, optionalUuid } from "./common";

// Schemas shared by quotations (QT) and proforma invoices (PI). Both use the same line items and
// header fields; only the section-toggle defaults differ (QT: off, PI: on — set by the form/DB).

export const moneyField = (label: string) =>
  z
    .number({ error: `Enter ${label}` })
    .min(0, "Cannot be negative")
    .max(1_000_000_000)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "At most 2 decimal places");

/** MFD/EXP on QT/PI lines are typed manually (indicative only) but required. */
const requiredMonthYear = (label: string) =>
  z.string({ error: `Enter ${label}` }).trim().min(1, `Enter ${label}`).regex(MONTH_YEAR_RE, `${label} must be MM/YYYY`);

/** One line on a QT or PI — never carries a batch (batches are assigned on the PI later). */
export const quotationItemSchema = z
  .object({
    productId: z.uuid("Select a product"),
    mfd: requiredMonthYear("MFD"),
    exp: requiredMonthYear("EXP"),
    quantity: z
      .number({ error: "Enter a quantity" })
      .int("Whole numbers only")
      .min(1, "At least 1")
      .max(100_000_000),
    unit: optionalText(50),
    sellingPriceUsd: moneyField("a price").gt(0, "Price must be more than 0"),
  })
  .refine((v) => !v.mfd || !v.exp || monthIndex(v.exp) > monthIndex(v.mfd), {
    message: "EXP must be after MFD",
    path: ["exp"],
  });
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;

/**
 * Header + items common to QT and PI. Freight/bank/other fields are always accepted; the
 * section toggles decide whether they are shown and whether freight counts toward the C&F total.
 */
export const documentFieldsSchema = z.object({
  customerId: z.uuid("Select a customer"),
  items: z.array(quotationItemSchema).min(1, "Add at least one product").max(200),
  // Freight & C&F section
  airFreight: moneyField("air freight"),
  handlingDocumentation: moneyField("handling & documentation"),
  cnfDestination: optionalText(100),
  // Bank details section
  bankDetailId: optionalUuid("Select a valid bank account"),
  // Other details section
  marks: optionalText(500),
  paymentTerms: optionalText(500),
  notes: optionalText(2000),
  // Display options
  showMfd: z.boolean(),
  showExp: z.boolean(),
  showGenericName: z.boolean(),
});

export const sectionTogglesSchema = z.object({
  showFreight: z.boolean(),
  showBankDetails: z.boolean(),
  showOtherDetails: z.boolean(),
});
export type SectionToggles = z.infer<typeof sectionTogglesSchema>;

/** Create + update a quotation. Forms start with all three sections OFF. */
export const createQuotationSchema = documentFieldsSchema.extend(sectionTogglesSchema.shape);
export type QuotationCreateInput = z.infer<typeof createQuotationSchema>;

/** Any QT/PI header + items payload. Toggles may be absent (old order routes) → treated as ON. */
export type DocumentInput = z.infer<typeof documentFieldsSchema> & Partial<SectionToggles>;

export const rejectQuotationSchema = z.object({
  reason: z.string().trim().min(3, "Rejection reason must be at least 3 characters").max(1000),
});
export type RejectQuotationInput = z.infer<typeof rejectQuotationSchema>;

export const QUOTATION_SORT_FIELDS = ["quotationNumber", "customerName", "status", "totalCnf", "createdAt"] as const;
export type QuotationSortField = (typeof QUOTATION_SORT_FIELDS)[number];

export const quotationStatusParam = z.enum(QUOTATION_STATUSES);
