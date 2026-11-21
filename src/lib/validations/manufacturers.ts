import { z } from "zod";
import { optionalText, requiredText } from "./common";

export const manufacturerSchema = z.object({
  name: requiredText("Name", 200),
  country: optionalText(100),
  contactInfo: optionalText(500),
});
export type ManufacturerInput = z.infer<typeof manufacturerSchema>;

export const MANUFACTURER_SORT_FIELDS = ["manufacturerNumber", "name", "country", "productCount", "createdAt"] as const;
export type ManufacturerSortField = (typeof MANUFACTURER_SORT_FIELDS)[number];
