import { z } from "zod";
import { ROLES } from "../constants";
import { passwordSchema, usernameSchema } from "./auth";
import { optionalEmail, optionalText, requiredText } from "./common";

// z.guid, not z.uuid: the legacy companies have ids like 00000000-0000-0000-0000-000000000001.
const companyId = z.guid("Select a valid company");
const defaultCompanyId = z.union([z.literal(""), companyId]);

/** What people can change about themselves (Settings) and admins about others. */
export const userProfileSchema = z.object({
  fullName: requiredText("Full name", 200),
  email: optionalEmail,
  phone: optionalText(50),
});
export type UserProfileInput = z.infer<typeof userProfileSchema>;

export const companyAssignmentSchema = z
  .object({
    companyIds: z.array(companyId).min(1, "Assign at least one company"),
    defaultCompanyId,
  })
  .refine((v) => !v.defaultCompanyId || v.companyIds.includes(v.defaultCompanyId), {
    message: "The default company must be one of the assigned companies",
    path: ["defaultCompanyId"],
  });
export type CompanyAssignmentInput = z.infer<typeof companyAssignmentSchema>;

const role = z.enum(ROLES, { error: "Select a role" });

export const userCreateSchema = userProfileSchema
  .extend({
    username: usernameSchema,
    password: passwordSchema,
    role,
    companyIds: z.array(companyId).min(1, "Assign at least one company"),
    defaultCompanyId,
  })
  .refine((v) => !v.defaultCompanyId || v.companyIds.includes(v.defaultCompanyId), {
    message: "The default company must be one of the assigned companies",
    path: ["defaultCompanyId"],
  });
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = userProfileSchema.extend({ role });
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

/** The edit form shares its fields with create; username and password aren't edited there. */
export const userEditFormSchema = userProfileSchema.extend({
  username: z.string(),
  password: z.string(),
  role,
  companyIds: z.array(companyId).min(1, "Assign at least one company"),
  defaultCompanyId,
});

/** Owner accounts aren't tied to companies. */
export const ownerEditFormSchema = userEditFormSchema.extend({
  companyIds: z.array(companyId),
});

const confirmed = <T extends { newPassword: string; confirmPassword: string }>(v: T) => v.newPassword === v.confirmPassword;
const mismatch = { message: "Passwords do not match", path: ["confirmPassword"] };

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(200),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(confirmed, mismatch)
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Choose a password different from the current one",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const resetPasswordSchema = z
  .object({ newPassword: passwordSchema, confirmPassword: z.string() })
  .refine(confirmed, mismatch);
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const USER_SORT_FIELDS = ["fullName", "username", "role", "status", "lastLoginAt", "createdAt"] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];
