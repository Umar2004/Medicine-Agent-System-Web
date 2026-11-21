import { z } from "zod";
import { optionalEmail, optionalText, requiredText } from "./common";

export const customerSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Code must be 2–10 characters")
    .max(10, "Code must be 2–10 characters")
    .regex(/^[A-Z0-9]+$/, "Letters and numbers only (used in invoice numbers)"),
  name: requiredText("Name", 200),
  businessName: optionalText(200),
  contactPerson: optionalText(200),
  phone: optionalText(50),
  email: optionalEmail,
  address: optionalText(500),
  city: optionalText(100),
  country: optionalText(100),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const CUSTOMER_SORT_FIELDS = ["customerNumber", "code", "name", "businessName", "country", "createdAt"] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];
