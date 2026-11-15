import { NextResponse, type NextRequest } from "next/server";
import { stagingRequiredRole, stagingSessionHasRole } from "./lib/staging-page-access";

/**
 * Extra server-side staging protection for sensitive staff HTML.
 * Nginx maps the HttpOnly vg_session cookie path to "/" for Next.
 * NestJS independently enforces role, branch, CSRF and session authority.
 */
export async function proxy(request: NextRequest) {
  if (process.env.UAT_PORTAL_LOGIN_REQUIRED !== "1") return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const role = stagingRequiredRole(pathname);
  if (!role) return NextResponse.next();

  const secret = request.cookies.get("vg_session")?.value;
  if (secret && /^[a-f0-9]{64}$/.test(secret)) {
    try {
      const base = process.env.API_BASE_URL ?? "";
      // Never relay HttpOnly credentials to a public or attacker-controlled host.
      const target = new URL(base.replace(/\/+$/, "") + "/auth/me");
      if (target.protocol === "http:" && target.hostname === "127.0.0.1" &&
          !target.username && !target.password &&
          target.pathname === "/api/v1/auth/me") {
        const auth = await fetch(target.toString(), {
          method: "GET",
          headers: { cookie: "vg_session=" + secret },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(3000),
        });
        if (auth.ok && stagingSessionHasRole(await auth.json(), role)) {
          const allowed = NextResponse.next();
          allowed.headers.set("Cache-Control", "private, no-store");
          return allowed;
        }
      }
    } catch {
      // Fail closed on timeout, invalid configuration and unexpected responses.
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Staff sign-in required." } },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const login = new URL("/staff/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login, {
    status: 307,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const config = {
  matcher: [
    "/staff/cashier/:path*",
    "/staff/pos/:path*",
    "/admin/team/verified/:path*",
  ],
};
