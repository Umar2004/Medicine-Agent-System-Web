import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required").max(100),
  password: z.string().min(1, "Password is required").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password is too long");

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(50)
  .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore");

export const registerOwnerSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  username: usernameSchema,
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  password: passwordSchema,
});
export type RegisterOwnerInput = z.infer<typeof registerOwnerSchema>;
