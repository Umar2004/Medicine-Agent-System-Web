import { count, sql } from "drizzle-orm";
import { db, users } from "@/db";
import { errors, handler, ok, parseBody } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { getRequestMeta } from "@/lib/request-meta";
import { emptyToNull, registerOwnerSchema } from "@/lib/validations";

// Arbitrary constant key for the advisory lock that serialises owner setup.
const OWNER_SETUP_LOCK = 742_001;

async function userCount(): Promise<number> {
  // Includes soft-deleted users: setup is only ever available on a brand-new database.
  const [{ total }] = await db.select({ total: count() }).from(users);
  return total;
}

/** Tells the login page whether to show the one-time owner setup form. */
export const GET = handler(async () => {
  return ok({ available: (await userCount()) === 0 });
});

export const POST = handler(async (req) => {
  const input = await parseBody(req, registerOwnerSchema);
  const passwordHash = await hashPassword(input.password);

  const owner = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${OWNER_SETUP_LOCK})`);
    const [{ total }] = await tx.select({ total: count() }).from(users);
    if (total > 0) throw errors.forbidden("Owner setup has already been completed");

    const [created] = await tx
      .insert(users)
      .values({
        username: input.username,
        passwordHash,
        fullName: input.fullName,
        email: emptyToNull(input.email),
        role: "owner",
      })
      .returning({ id: users.id, username: users.username, fullName: users.fullName, role: users.role });
    return created;
  });

  auditLog({
    user: { id: owner.id, username: owner.username },
    companyId: null,
    actionType: ACTION_TYPES.USER_CREATED,
    entityName: "User",
    entityId: owner.id,
    newValue: { username: owner.username, fullName: owner.fullName, role: owner.role },
    meta: getRequestMeta(req),
  });

  return ok({ id: owner.id, username: owner.username }, { status: 201 });
});
