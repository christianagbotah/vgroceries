import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { stagingRequiredRole, stagingSessionHasRole } from "../src/lib/staging-page-access";

const read = (file:string) => readFileSync(file,"utf8");
const login = read("src/app/staff/rider/login/page.tsx");
const panel = read("src/app/staff/rider/cod/page.tsx");
const client = read("src/features/rider/verified-cod-client.ts");
const demoJob = read("src/app/rider/jobs/[id]/page.tsx");
const demoHome = read("src/app/rider/page.tsx");
const demoHistory = read("src/app/rider/history/page.tsx");
const proxy = read("src/proxy.ts");
const demoLogin = read("src/app/rider/login/page.tsx");

describe("verified COD cash declaration rider screen is not the old mock rider selector", () => {
  test("page access additionally authenticates the real rider role in staging", () => {
    expect(stagingRequiredRole("/staff/rider/cod")).toBe("rider");
    expect(stagingRequiredRole("/staff/rider/cod/history")).toBe("rider");
    expect(stagingRequiredRole("/staff/rider/login")).toBeNull();
    expect(stagingSessionHasRole({ok:true,data:{actor:{role:"rider",id:"rider-id"}}},"rider")).toBe(true);
    for (const role of ["admin","cashier","inventory_manager","customer"])
      expect(stagingSessionHasRole({ok:true,data:{actor:{role,id:"rider-id"}}},"rider")).toBe(false);
    expect(proxy).toContain('"/staff/rider/cod/:path*"');
    expect(login).toContain('session.actor.role!=="rider"');
    expect(panel).toContain('session.actor.role!=="rider"');
    expect(panel).not.toContain("useRiderSession");
    expect(panel).not.toContain("localStorage");
    expect(panel).not.toContain("/api/mock/v1");
  });

  test("feature defaults OFF, requires genuine backend authority and never trusts a demo account", () => {
    expect(client).toContain('process.env.NEXT_PUBLIC_VERIFIED_RIDER_COD_D1 === "1"');
    expect(client).toContain('isDemoStaffSessionActive()');
    expect(client).toContain("NEXT_PUBLIC_API_BASE_URL");
    expect(client).toContain('new ApiError("FEATURE_DISABLED"');
    expect(client).toContain('new ApiError("BAD_CONFIG"');
    expect(client).toContain('uri.username || uri.password');
    expect(login).toContain("clearDemoStaffSession()");
    expect(login).toContain("isDemoStaffSessionActive()");
    expect(login).toContain("apiOps.staffLogin(email,password)");
    expect(login).toContain("apiOps.staffLogout()");
    expect(demoLogin).toContain('href="/staff/rider/login"');
  });

  test("only real server-owned COD order totals are declared using CSRF, replay ID and strict unverified response", () => {
    expect(client).toContain("/api/v1/rider/jobs?scope=history");
    expect(client).toContain('credentials: "include"');
    expect(client).toContain('cache: "no-store"');
    expect(client).toContain("riderJobsResponseSchema.safeParse(envelope.data)");
    expect(client).toContain("codCashDeclarationRequestSchema.safeParse(request)");
    expect(client).toContain("codCashDeclarationViewSchema.safeParse(envelope.data)");
    expect(client).toContain('"Idempotency-Key": replayKey');
    expect(client).toContain('"X-CSRF-Token": csrf');
    expect(client).toContain("!saved.success || saved.data.deliveryJobId !== jobId");
    expect(client).toContain("saved.data.supervisorVerified ||");
    expect(client).toContain("saved.data.remitted || saved.data.paymentStatusChanged");
    expect(panel).toContain("selected.codDueMinor!");
    expect(panel).toContain('job.paymentStatus==="unpaid"');
    expect(panel).toContain('job.paymentMethod==="cash_on_delivery"');
    expect(panel).toContain("Boolean(job.proof)");
    expect(panel).toContain('window.crypto.randomUUID()');
    expect(panel).toContain('attempt.current.jobId===selected.jobId');
    expect(panel).toContain("I physically counted the complete cash amount");
    expect(panel).toContain("I currently hold that exact physical cash");
    expect(panel).toContain("supervisor unverified");
    expect(panel).not.toContain("markPaid");
    expect(panel).not.toContain("markRemitted");
  });

  test("failed authorization and account changes do not expose previous rider records", () => {
    expect(panel).toContain('setJobs([]);setRiderName("")');
    expect(panel).toContain("setSelected(null);setSaved(null);setCompleted([])");
    expect(panel).toContain("controller.abort()");
    expect(client).toContain("responseError(response.status)");
    expect(client).not.toContain("vg-rider-id-v1");
  });

  test("demo delivery proof no longer declares cash collected or remitted", () => {
    expect(demoJob).not.toContain("setCashCollected");
    expect(demoJob).not.toContain("cashCollected },");
    expect(demoJob).toContain("Demo delivery completion does not certify cash collection");
    expect(demoHome).toContain("demo-only illustration");
    expect(demoHistory).toContain("mock marked as remitted");
    expect(demoHistory).toContain("mock marked as collected");
  });
});
