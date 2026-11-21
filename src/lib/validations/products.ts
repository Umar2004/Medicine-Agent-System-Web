import { z } from "zod";

// Form-friendly shape: optional text fields are '' when empty; the API stores them as NULL.
export const productSchema = z.object({
  brandName: z.string().trim().min(1, "Brand name is required").max(200),
  genericName: z.string().trim().max(200),
  manufacturerId: z.union([z.literal(""), z.uuid("Select a valid manufacturer")]),
  unit: z.string().trim().max(50),
  country: z.string().trim().max(100),
  lowStockThreshold: z
    .number({ error: "Enter a number" })
    .int("Must be a whole number")
    .min(0, "Cannot be negative")
    .max(10_000_000),
});
export type ProductInput = z.infer<typeof productSchema>;

export const PRODUCT_SORT_FIELDS = [
  "productNumber",
  "brandName",
  "genericName",
  "manufacturerName",
  "totalStock",
  "createdAt",
] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];
