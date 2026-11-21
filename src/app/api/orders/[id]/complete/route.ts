import { and, eq } from "drizzle-orm";
import { db, invoices, orders } from "@/db";
import { errors, handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES } from "@/lib/constants";
import { orderActionContext } from "@/lib/order-actions";
import { getOrderDetail, lockOrder } from "@/lib/orders";

/** Manual close after payment (CLAUDE.md §7.2 step 6): invoiced → completed, the invoice must be issued. */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const { id, user, meta, companyId } = await orderActionContext(req, params, "manage_orders");

  await db.transaction(async (tx) => {
    await lockOrder(tx, id, companyId, ["invoiced"]);
    const [issued] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orderId, id), eq(invoices.status, "issued"), eq(invoices.isDeleted, false)))
      .limit(1);
    if (!issued) throw errors.conflict("Issue the invoice before marking the order as completed.");
    await tx.update(orders).set({ status: "completed", updatedAt: new Date() }).where(eq(orders.id, id));
  });

  auditLog({ user, companyId, actionType: ACTION_TYPES.ORDER_COMPLETED, entityName: "Order", entityId: id, meta });
  return ok(await getOrderDetail(id, companyId));
});
