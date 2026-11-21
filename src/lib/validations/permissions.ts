import { z } from "zod";
import { PERMISSION_KEYS, ROLES } from "../constants";

const editableRole = z.enum(ROLES.filter((r) => r !== "owner") as [string, ...string[]]);

/** The full matrix for each non-owner role; owner always has everything. */
export const permissionsUpdateSchema = z.object({
  roles: z
    .array(
      z.object({
        role: editableRole,
        permissions: z.array(z.enum(PERMISSION_KEYS)),
        routes: z.array(z.string().startsWith("/").max(100)),
      }),
    )
    .min(1),
});
export type PermissionsUpdateInput = z.infer<typeof permissionsUpdateSchema>;
