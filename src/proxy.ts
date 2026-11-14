import { NextResponse, type NextRequest } from "next/server";

/**
 * A human-friendly entrance to PRIVATE staging. This is not the backend's
 * authorisation layer: every privileged API route still checks the DB session,
 * actor role and branch grants itself.
 *
 * The reverse proxy rewrites the API's HttpOnly vg_session cookie path to "/"
 * on the canonical staging host, so this server-side proxy can see it.
 * The secret is never made readable to browser JavaScript.
 */
export async function proxy(req: NextRequest) {
  if (process.env.UAT_PORTAL_LOGIN_REQUIRED !== "1") return NextResponse.next();

  const { pathname } = req.nextUrl;
  const publicPaths = [
    "/staff/login", "/staff/activate",
    "/account/login", "/account/signup", "/rider/login",
  ];
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"))) {
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
  if (pathname.startsWith("/admin") || pathname === "/staff/cashier" || pathname === "/staff/pos") {
    url.searchParams.set("next", pathname);
  }
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
