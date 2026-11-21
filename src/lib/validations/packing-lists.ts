import { z } from "zod";
import { optionalText } from "./common";

const optionalNumber = (label: string) =>
  z
    .number({ error: `Enter a number for ${label}` })
    .min(0, "Cannot be negative")
    .max(99_999_999)
    .nullable();

const cartonNo = z.number({ error: "Enter a carton number" }).int("Whole numbers only").min(1).max(10_000_000).nullable();

export const packingListItemSchema = z
  .object({
    cartonStart: cartonNo,
    cartonEnd: cartonNo,
    description: z.string().trim().min(1, "Description is required").max(500),
    packingDetails: optionalText(200),
  })
  .refine((v) => v.cartonStart === null || v.cartonEnd === null || v.cartonEnd >= v.cartonStart, {
    message: "End carton must be ≥ start",
    path: ["cartonEnd"],
  });

export const packingListSchema = z.object({
  shipmentReference: optionalText(200),
  totalCartons: optionalText(100),
  containerInfo: optionalText(200),
  grossWeightKg: optionalNumber("gross weight"),
  netWeightKg: optionalNumber("net weight"),
  cbm: optionalNumber("CBM"),
  marks: optionalText(200),
  date: z.union([z.literal(""), z.iso.date("Enter a valid date")]),
  items: z.array(packingListItemSchema).min(1, "Add at least one line").max(500),
});
export type PackingListInput = z.infer<typeof packingListSchema>;

export const packingListCreateSchema = packingListSchema.extend({ invoiceId: z.uuid() });
