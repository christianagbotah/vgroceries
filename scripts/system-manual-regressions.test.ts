import {describe,expect,test} from "bun:test";
import {readdirSync,readFileSync} from "node:fs";
import {join,relative,resolve} from "node:path";
import {
  MANUAL_SCREENS,screenLink,screensForRole,
} from "../src/features/manual/catalogue";
import {MANUAL_WORKFLOWS,workflowsForRole} from "../src/features/manual/workflows";
import {createOfflineManualHtml} from "../src/features/manual/export";

const root=resolve(import.meta.dir,"..");
function* files(directory:string):Generator<string>{
  for(const dirent of readdirSync(directory,{withFileTypes:true})){
    const full=join(directory,dirent.name);
    if(dirent.isDirectory())yield* files(full);
    else if(dirent.name==="page.tsx")yield full;
  }
}
function toRoute(file:string):string{
  const normal=relative(join(root,"src/app"),file).replaceAll("\\","/");
  const path=normal.replace(/^\(storefront\)\//,"").replace(/\/?page\.tsx$/,"").replace(/\/$/,"");
  return path?"/"+path:"/";
}
const expectedRoutes=[...files(join(root,"src/app"))].map(toRoute)
  .filter(route=>route!=="/manual"&&route!=="/rider/guide").sort();

describe("Role-aware illustrated system manual",()=>{
  test("all 79 actual existing application screens are individually documented with no invented route",()=>{
    expect(MANUAL_SCREENS.length).toBeGreaterThanOrEqual(75);
    expect(new Set(MANUAL_SCREENS.map(s=>s.path)).size).toBe(MANUAL_SCREENS.length);
    expect(MANUAL_SCREENS.map(s=>s.path).sort()).toEqual(expectedRoutes);
    for(const screen of MANUAL_SCREENS){
      expect(screen.title.trim().length).toBeGreaterThan(2);
      expect(screen.purpose.length).toBeGreaterThan(20);
      expect(screen.action.length).toBeGreaterThan(20);
      expect(screen.check.length).toBeGreaterThan(20);
      expect(["gated","preview","implemented"]).toContain(screen.readiness);
      expect(screenLink(screen.path)).toStartWith("/");
    }
  });

  test("admin sees every role; non-admin viewers see only their scope and safe shared help",()=>{
    const admin=screensForRole("admin");
    expect(admin.length).toBe(MANUAL_SCREENS.length);
    expect(admin.some(s=>s.path==="/admin/settings")).toBe(true);
    expect(admin.some(s=>s.path==="/staff/rider/cod")).toBe(true);
    expect(admin.some(s=>s.path==="/checkout")).toBe(true);
    const allowed={
      inventory_manager:["inventory","shared"],cashier:["cashier","shared"],
      rider:["rider","shared"],customer:["customer","shared"],
    } as const;
    for(const role of ["inventory_manager","cashier","rider","customer"] as const){
      const scope=screensForRole(role);
      expect(scope.length).toBeGreaterThan(5);
      for(const screen of scope)expect((allowed[role] as readonly string[]).includes(screen.audience)).toBe(true);
      expect(scope.some(s=>s.path==="/admin/settings")).toBe(false);
      expect(scope.some(s=>s.path==="/admin/team")).toBe(false);
    }
    expect(screensForRole("cashier").some(s=>s.path==="/staff/cashier/workspace")).toBe(true);
    expect(screensForRole("rider").some(s=>s.path==="/staff/rider/cod")).toBe(true);
  });

  test("workflow diagrams cover critical order, inventory, POS, returns and cash separation",()=>{
    expect(MANUAL_WORKFLOWS.length).toBeGreaterThanOrEqual(10);
    for(const flow of MANUAL_WORKFLOWS){
      expect(flow.stages.length).toBeGreaterThanOrEqual(5);
      expect(flow.gate.length).toBeGreaterThan(30);
      expect(flow.whatNext.length).toBeGreaterThan(25);
    }
    for(const id of ["shopping","inventory","pos","drawer","cod","returns","dispatch","staff"]){
      expect(MANUAL_WORKFLOWS.some(x=>x.id===id)).toBe(true);
    }
    expect(workflowsForRole("customer").every(x=>x.audience==="customer"||x.audience==="shared")).toBe(true);
    expect(workflowsForRole("admin").length).toBe(MANUAL_WORKFLOWS.length);
  });

  test("full downloaded offline manual has TOC, complete bounded role edition, diagram and safe escaping",()=>{
    const screens=screensForRole("cashier"),flows=workflowsForRole("cashier");
    const html=createOfflineManualHtml("cashier",screens,flows);
    expect(html).toContain("Cashier workspace");
    expect(html).toContain("WORKFLOW");
    expect(html).toContain("SCREEN");
    expect(html).toContain("Annotated conceptual screen map");
    expect(html).toContain('href="#screen-0"');
    expect(html).not.toContain("System settings");
    expect(html).not.toContain("manage customer SMS credentials");
    expect(html).toContain("@media print");
    const injection=createOfflineManualHtml("customer",[
      {...screensForRole("customer")[0]!,title:'<script>alert("x")</script>'},
    ],[]);
    expect(injection).not.toContain("<script>");
    expect(injection).toContain("&lt;script&gt;");
    expect(html).toContain("@page{margin:14mm;size:A4}");
  });

  test("manual uses authenticated role and links from customer, cashier, admin, rider portals",()=>{
    const reader=readFileSync(join(root,"src/features/manual/reader.tsx"),"utf8");
    expect(reader).toContain("apiOps.accountSession()");
    expect(reader).toContain("isManualRole(real)");
    expect(reader).toContain('window.addEventListener("focus",verify)');
    expect(reader).toContain('document.addEventListener("visibilitychange",onVisible)');
    expect(reader).toContain('setRole(guestScope);setAuthenticated(false)');
    expect(reader).toContain('role==="admin"');
    expect(reader).not.toContain("localStorage");
    expect(reader).not.toContain("useSearchParams");
    expect(reader).toContain("downloadOfflineManual");
    expect(reader).toContain("printManualAsPdf");
    for(const file of [
      "src/components/layout/admin-shell.tsx",
      "src/components/layout/storefront-shell.tsx",
      "src/app/staff/cashier/workspace/page.tsx",
      "src/app/(storefront)/help/page.tsx",
      "src/app/(storefront)/account/page.tsx",
      "src/app/staff/rider/cod/page.tsx",
    ])expect(readFileSync(join(root,file),"utf8")).toContain("/manual");
    expect(readFileSync(join(root,"src/components/layout/rider-shell.tsx"),"utf8")).toContain("/rider/guide");
    expect(readFileSync(join(root,"src/app/manual/page.tsx"),"utf8")).toContain("<ManualReader");
    expect(readFileSync(join(root,"src/app/rider/guide/page.tsx"),"utf8")).toContain('guestScope="rider"');
  });
});
