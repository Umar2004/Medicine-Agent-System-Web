import { handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { clearAuthCookies, peekSession } from "@/lib/auth";
import { ACTION_TYPES, REFRESH_COOKIE } from "@/lib/constants";
import { revokeRefreshToken } from "@/lib/refresh-tokens";
import { getRequestMeta } from "@/lib/request-meta";

export const POST = handler(async (req) => {
  const session = await peekSession(req);
  const plain = req.cookies.get(REFRESH_COOKIE)?.value;
  if (plain) await revokeRefreshToken(plain);

  if (session) {
    auditLog({
      user: session,
      companyId: null,
      actionType: ACTION_TYPES.LOGOUT,
      entityName: "User",
      entityId: session.id,
      meta: getRequestMeta(req),
    });
  }

  const res = ok({ loggedOut: true });
  clearAuthCookies(res);
  return res;
});
