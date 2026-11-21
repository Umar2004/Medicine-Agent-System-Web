import { and, eq } from "drizzle-orm";
import { db, signatures } from "@/db";
import { errors, handler, ok, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { getRequestMeta } from "@/lib/request-meta";

/** Soft delete — invoices already signed keep pointing at the image. Own signatures only. */
export const DELETE = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Signature");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);

  const [sig] = await db
    .select({ id: signatures.id, companyId: signatures.companyId, label: signatures.label })
    .from(signatures)
    .where(and(eq(signatures.id, id), eq(signatures.userId, user.id), eq(signatures.isDeleted, false)))
    .limit(1);
  if (!sig) throw errors.notFound("Signature");

  await db.update(signatures).set({ isDeleted: true }).where(eq(signatures.id, id));
  auditLog({
    user,
    companyId: sig.companyId,
    actionType: ACTION_TYPES.SIGNATURE_DELETED,
    entityName: "Signature",
    entityId: id,
    oldValue: { label: sig.label },
    meta,
  });
  return ok({ id });
});
