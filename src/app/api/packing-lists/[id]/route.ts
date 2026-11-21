import { eq } from "drizzle-orm";
import { db, packingListItems, packingLists } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { getPackingList, insertPackingItems, PACKING_READ_ROUTES, packingHeaderValues } from "@/lib/packing-lists";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { packingListSchema } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Packing list");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, PACKING_READ_ROUTES, { meta: getRequestMeta(req), companyId });
  const detail = await getPackingList(id, companyId);
  if (!detail) throw errors.notFound("Packing list");
  return ok(detail);
});

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Packing list");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_packing_lists", { meta, companyId });

  const before = await getPackingList(id, companyId);
  if (!before) throw errors.notFound("Packing list");
  const input = await parseBody(req, packingListSchema);

  await db.transaction(async (tx) => {
    await tx
      .update(packingLists)
      .set({ ...packingHeaderValues(input), updatedAt: new Date() })
      .where(eq(packingLists.id, id));
    await tx.delete(packingListItems).where(eq(packingListItems.packingListId, id));
    await insertPackingItems(tx, id, input.items);
  });

  const after = await getPackingList(id, companyId);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PACKING_LIST_UPDATED,
    entityName: "PackingList",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  return ok(after);
});

/** Hard delete — packing lists have no soft-delete column; lines cascade. */
export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Packing list");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_packing_lists", { meta, companyId });

  const before = await getPackingList(id, companyId);
  if (!before) throw errors.notFound("Packing list");
  await db.delete(packingLists).where(eq(packingLists.id, id));

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PACKING_LIST_DELETED,
    entityName: "PackingList",
    entityId: id,
    oldValue: before,
    meta,
  });
  return ok({ id });
});
