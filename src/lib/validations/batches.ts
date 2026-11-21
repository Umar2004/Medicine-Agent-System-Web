import { z } from "zod";
import { PRICE_TYPES } from "../constants";
import { optionalUuid } from "./common";

export const MONTH_YEAR_RE = /^(0[1-9]|1[0-2])\/\d{4}$/;

/** "08/2028" → 2028*12 + 7 (comparable month index). */
export function monthIndex(value: string): number {
  const [mm, yyyy] = value.split("/").map(Number);
  return yyyy * 12 + (mm - 1);
}

const monthYear = (label: string) =>
  z.string().trim().regex(MONTH_YEAR_RE, `${label} must be MM/YYYY, e.g. 08/2028`);

export const batchSchema = z
  .object({
    productId: z.uuid("Select a product"),
    batchNumber: z.string().trim().min(1, "Batch number is required").max(100),
    mfd: monthYear("MFD"),
    exp: monthYear("EXP"),
    stockQuantity: z
      .number({ error: "Enter a quantity" })
      .int("Must be a whole number")
      .min(0, "Cannot be negative")
      .max(100_000_000),
    supplierId: optionalUuid("Select a valid supplier"),
    costPrice: z
      .number({ error: "Enter a price" })
      .min(0, "Cannot be negative")
      .max(1_000_000_000)
      .nullable(),
    priceType: z.union([z.literal(""), z.enum(PRICE_TYPES)]),
    isActive: z.boolean(),
  })
  .refine((v) => !MONTH_YEAR_RE.test(v.mfd) || !MONTH_YEAR_RE.test(v.exp) || monthIndex(v.exp) > monthIndex(v.mfd), {
    message: "EXP must be after MFD",
    path: ["exp"],
  });
export type BatchInput = z.infer<typeof batchSchema>;

export const batchStockSchema = z.object({
  stockQuantity: z
    .number({ error: "Enter a quantity" })
    .int("Must be a whole number")
    .min(0, "Cannot be negative")
    .max(100_000_000),
  reason: z.string().trim().max(500).optional(),
});
export type BatchStockInput = z.infer<typeof batchStockSchema>;

export const BATCH_STATUSES = ["active", "near_expiry", "expired", "inactive", "out_of_stock"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_SORT_FIELDS = [
  "batchNumber",
  "productName",
  "exp",
  "stockQuantity",
  "costPrice",
  "supplierName",
  "createdAt",
] as const;
export type BatchSortField = (typeof BATCH_SORT_FIELDS)[number];
