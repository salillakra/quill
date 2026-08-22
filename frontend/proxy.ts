import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = new Set(["/login"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = Boolean(request.cookies.get("quill_session")?.value);

  if (!authed && !PUBLIC.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (authed && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/documents";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (
    authed &&
    (pathname === "/jobs" ||
      pathname === "/analytics" ||
      pathname.startsWith("/jobs/") ||
      pathname.startsWith("/analytics/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/documents";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|socket\\.io|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
