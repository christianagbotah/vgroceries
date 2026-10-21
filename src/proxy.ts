import { NextRequest, NextResponse } from "next/server";

const ACCOUNT_LOGIN_PATH = "/account/login";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === ACCOUNT_LOGIN_PATH) return NextResponse.next();
  if (request.cookies.get("vg_session")?.value) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/account/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/account/:path*"],
};
