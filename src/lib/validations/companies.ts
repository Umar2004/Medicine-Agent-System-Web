import { z } from "zod";
import { optionalEmail, optionalText, requiredText } from "./common";

export const companySchema = z.object({
  name: requiredText("Company name", 200),
  address: optionalText(500),
  phone: optionalText(50),
  email: optionalEmail,
  website: optionalText(200),
  taxId: optionalText(100),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Use a 3-letter code, e.g. USD"),
});
export type CompanyInput = z.infer<typeof companySchema>;
