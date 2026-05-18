import { NextRequest, NextResponse } from "next/server";

const cookieName =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME || process.env.SESSION_COOKIE_NAME || "kage_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/dashboard")) {
    const session = request.cookies.get(cookieName);
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"]
};
