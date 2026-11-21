import { z } from "zod";

// Form-friendly helpers: optional text fields are '' when empty; the API stores NULL.

export const optionalText = (max: number) => z.string().trim().max(max, `Must be ${max} characters or fewer`);

export const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address").max(200)]);

export const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `Must be ${max} characters or fewer`);

export const optionalUuid = (message: string) => z.union([z.literal(""), z.uuid(message)]);
