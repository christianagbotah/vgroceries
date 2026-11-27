import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {operationMeta} from "../src/services/operation-registry";
test("administrator order reads bypass optional browser TTL caching",()=>{
 expect(operationMeta["admin.orders"]).toEqual({});
 expect(operationMeta["admin.order"]).toEqual({});
 const controller=readFileSync("apps/api/src/orders/admin-orders.controller.ts","utf8");
 for(const route of ['@Get()','@Get(":orderId")','@Post(":orderId/notes")']){
  const start=controller.indexOf(route);
  expect(start).toBeGreaterThanOrEqual(0);
  const decorators=controller.slice(start,controller.indexOf("async ",start));
  expect(decorators).toContain('@Header("Cache-Control", "private, no-store")');
 }
});
test("order workspace offers visible, bounded refresh and explicitly submitted search",()=>{
 const page=readFileSync("src/app/admin/orders/page.tsx","utf8");
 expect(page).toContain("{ refreshMs: 15000 }");
 expect(page).toContain("Refresh orders");
 expect(page).toContain("Last updated:");
 expect(page).toContain('aria-label="Apply order search"');
 const hook=readFileSync("src/features/staff/admin-data.ts","utf8");
 expect(hook).toContain('document.visibilityState === "visible"');
 expect(hook).toContain("background && activeRequest.current");
 expect(hook).toContain("window.clearInterval(timer)");
 expect(hook).toContain("requestVersion.current");
});

test("order search filters while typing and includes historical product snapshots",()=>{
 const page=readFileSync("src/app/admin/orders/page.tsx","utf8");
 expect(page).toContain("setTimeout(() => setQ(searchInput.trim()), 300)");
 expect(page).toContain("window.clearTimeout(timer)");
 const query=readFileSync("apps/api/src/orders/admin-order-query.service.ts","utf8");
 expect(query).toContain("lines: { some: { OR: [{ productName:");
 expect(query).toContain("variantName: { contains: search");
});
test("live sign-in clears demo session before authentication and demo displays explicit exit",()=>{
 const login=readFileSync("src/features/staff/staff-login-form.tsx","utf8");
 expect(login).toContain('params.get("live") === "1"');
 expect(login).toContain("if (liveOnly || !demoEnabled) clearDemoStaffSession();");
 expect(login.indexOf("clearDemoStaffSession();",login.indexOf("const submit"))).toBeLessThan(login.indexOf("await apiOps.staffLogin"));
 const shell=readFileSync("src/components/layout/admin-shell.tsx","utf8");
 expect(shell).toContain("DEMO MODE — sample data only.");
 expect(shell).toContain("Switch to live staff sign-in");
});
