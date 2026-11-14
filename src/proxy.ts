import { NextResponse, type NextRequest } from "next/server";

/**
 * Customer storefront pages are freely browsable, including cart and checkout.
 * Only real staff cash-terminal HTML routes require a server-validated session.
 * The admin layout separately redirects guests or enables mock UAT previews;
 * no admin API operation trusts page routing, demo flags or browser state.
 *
 * The reverse proxy rewrites the API's HttpOnly vg_session cookie path to "/"
 * on the canonical staging host, so this server-side proxy can see it.
 * The secret is never made readable to browser JavaScript.
 */
export async function proxy(req: NextRequest) {
  if (process.env.UAT_PORTAL_LOGIN_REQUIRED !== "1") return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Storefront, products, cart, checkout, customer account entry and all
  // ordinary admin HTML shells are public at the *page* level. Real customer
  // checkout may be guest; account and admin layouts guard authenticated data.
  // Demo role previews are client-only and use the separate mock transport.
  // Only real cashier terminal routes require an authenticated server session
  // before an HTML shell is served.
  if (pathname !== "/staff/cashier" && pathname !== "/staff/pos") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("vg_session")?.value;
  if (cookie && /^[a-f0-9]{64}$/.test(cookie)) {
    try {
      const result = await fetch("http://127.0.0.1:3049/api/v1/auth/me", {
        method: "GET",
        headers: { cookie: `vg_session=${cookie}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      if (result.ok) return NextResponse.next();
    } catch {
      // Fail closed: a broken identity service cannot unlock staging content.
    }
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to access private staging." } }, { status: 401 });
  }
  const url = new URL("/staff/login", req.url);
  url.searchParams.set("next", pathname);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: [
    // Next internal assets, image files and the public metadata remain readable
    // so the login page can render without another credential layer.
    "/((?!_next/|favicon.ico|robots.txt|ads.txt|sitemap.xml|media/|images/|.*\\.(?:png|jpg|jpeg|webp|gif|svg|ico|woff|woff2)$).*)",
  ],
};
