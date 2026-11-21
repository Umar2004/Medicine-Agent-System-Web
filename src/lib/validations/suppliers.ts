import { z } from "zod";
import { optionalEmail, optionalText, requiredText } from "./common";

export const supplierSchema = z.object({
  name: requiredText("Name", 200),
  contactPerson: optionalText(200),
  phone: optionalText(50),
  contactNumber: optionalText(50),
  email: optionalEmail,
  address: optionalText(500),
  city: optionalText(100),
  country: optionalText(100),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const SUPPLIER_SORT_FIELDS = ["supplierNumber", "name", "city", "country", "createdAt"] as const;
export type SupplierSortField = (typeof SUPPLIER_SORT_FIELDS)[number];
