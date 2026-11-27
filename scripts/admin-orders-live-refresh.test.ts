import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {operationMeta} from "../src/services/operation-registry";
test("administrator order reads bypass optional browser TTL caching",()=>{
 expect(operationMeta["admin.orders"]).toEqual({});
 expect(operationMeta["admin.order"]).toEqual({});
 const controller=readFileSync("apps/api/src/orders/admin-orders.controller.ts","utf8");
 expect(controller.match(/@Header\("Cache-Control", "private, no-store"\)/g)?.length).toBe(2);
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
