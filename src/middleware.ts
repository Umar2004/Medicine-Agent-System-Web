import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/constants";
import { verifyAccessToken } from "@/lib/jwt";

// Page-level auth redirects only. API routes authenticate themselves (requireAuth),
// so they can return JSON 401s instead of redirects.

const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const session = await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);

  if (session) {
    if (isPublic || pathname === "/") return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (isPublic) return NextResponse.next();

  const next = `${pathname}${search}`;
  // Access token missing/expired but a refresh token exists → rotate, then come back.
  if (req.cookies.get(REFRESH_COOKIE)?.value) {
    return NextResponse.redirect(new URL(`/api/auth/refresh?next=${encodeURIComponent(next)}`, req.url));
  }
  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
