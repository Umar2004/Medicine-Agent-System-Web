import "server-only";
import type { NextRequest } from "next/server";
import { requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { requireCompany } from "@/lib/company-context";
import type { PermissionKey } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

/** Common preamble for QT/PI workflow routes: auth, company (required), permission. */
export async function orderActionContext(
  req: NextRequest,
  params: Promise<{ id: string }>,
  permission: PermissionKey | null,
  entity = "Order",
) {
  const id = requireUuid((await params).id, entity);
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  if (permission) await requirePermission(user, permission, { meta, companyId });
  return { id, user, meta, companyId };
}
