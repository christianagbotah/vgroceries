import {describe,expect,test} from "bun:test";
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {join,relative,resolve} from "node:path";
import {
  MANUAL_SCREENS,MANUAL_PENDING_SCREENS,MANUAL_DOCUMENTED_SCREENS,
  MANUAL_STAGING_SCREENS,MANUAL_SOURCE_ONLY_PATHS,screenLink,screensForRole,
} from "../src/features/manual/catalogue";
import {MANUAL_WORKFLOWS,workflowsForRole} from "../src/features/manual/workflows";
import {createOfflineManualHtml,printManualAsPdf} from "../src/features/manual/export";
import {manualVisual,type ManualVisualType} from "../src/features/manual/visual-model";
import {createManualUatCsv,downloadManualUatCsv,MANUAL_UAT_HEADER} from "../src/features/manual/uat-evidence";

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
      expect(["gated","preview","implemented","absent"]).toContain(screen.readiness);
      expect(screenLink(screen.path)).toStartWith("/");
    }
  });

  test("admin sees every role; non-admin viewers see only their scope and safe shared help",()=>{
    const admin=screensForRole("admin");
    expect(admin.length).toBe(MANUAL_DOCUMENTED_SCREENS.length);
    expect(admin.some(s=>s.path==="/admin/settings")).toBe(true);
    expect(admin.some(s=>s.path==="/admin/pos/verified-uat/history")).toBe(true);
    expect(admin.some(s=>s.path==="/admin/pos/verified-uat/reconciliation")).toBe(true);
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

  test("screen diagrams vary by source-grounded screen type and never assert fabricated values",()=>{
    const visuals=MANUAL_SCREENS.map(screen=>manualVisual(screen));
    const kinds=new Set<ManualVisualType>(visuals.map(x=>x.kind));
    expect(kinds.size).toBe(9);
    for(const visual of visuals){
      expect(visual.heading.length).toBeGreaterThan(5);
      expect(visual.elements).toHaveLength(4);
      expect(visual.emphasis.length).toBeGreaterThan(25);
    }
    expect(manualVisual(MANUAL_SCREENS.find(x=>x.path==="/shop")!).kind).toBe("catalogue");
    expect(manualVisual(MANUAL_SCREENS.find(x=>x.path==="/checkout")!).kind).toBe("checkout");
    expect(manualVisual(MANUAL_SCREENS.find(x=>x.path==="/admin/inventory")!).kind).toBe("ledger");
    expect(manualVisual(MANUAL_SCREENS.find(x=>x.path==="/staff/rider/cod")!).kind).toBe("rider");
    expect(manualVisual(MANUAL_SCREENS.find(x=>x.path==="/admin/payments")!).kind).toBe("cash");
  });

  test("full downloaded offline manual has TOC, complete bounded role edition, diagram and safe escaping",()=>{
    const screens=screensForRole("cashier"),flows=workflowsForRole("cashier");
    const html=createOfflineManualHtml("cashier",screens,flows);
    expect(html).toContain("Cashier workspace");
    expect(html).toContain("WORKFLOW");
    expect(html).toContain("SCREEN");
    expect(html).toContain("Annotated conceptual screen map");
    expect(html).toContain("blueprint-form");
    expect(html).toContain("blueprint-cash");
    expect(createOfflineManualHtml("admin",screensForRole("admin"),workflowsForRole("admin"))).toContain("blueprint-dashboard");
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

  test("guest/customer offline edition never includes admin back-office chapters",()=>{
    const guestHtml=createOfflineManualHtml("customer",screensForRole("customer"),workflowsForRole("customer"));
    expect(guestHtml).toContain("Customer — User Manual");
    expect(guestHtml).toContain("Checkout");
    expect(guestHtml).not.toContain("/admin/settings");
    expect(guestHtml).not.toContain("/admin/team");
    expect(guestHtml).not.toContain("Staff AI assistant");
    expect(guestHtml).toContain("blueprint-checkout");
    const riderHtml=createOfflineManualHtml("rider",screensForRole("rider"),workflowsForRole("rider"));
    expect(riderHtml).toContain("Rider COD declaration");
    expect(riderHtml).not.toContain("System settings");
  });

  test("Print / Save PDF opens the full edition only after document load",()=>{
    const prior=Object.getOwnPropertyDescriptor(globalThis,"window");
    let onLoad=()=>{};
    let printed=0,focused=0,html="";
    const popup={
      document:{open:()=>{},write:(value:string)=>{html+=value;},close:()=>{}},
      addEventListener:(event:string,callback:()=>void)=>{
        expect(event).toBe("load");onLoad=callback;
      },
      focus:()=>{focused++;},print:()=>{printed++;},
    };
    try{
      Object.defineProperty(globalThis,"window",{
        configurable:true,value:{open:()=>popup},
      });
      expect(printManualAsPdf("cashier",screensForRole("cashier"),workflowsForRole("cashier"))).toBe(true);
      expect(printed).toBe(0);
      expect(html).toContain("Cashier — User Manual");
      expect(html).not.toContain("/admin/team");
      onLoad();
      expect(printed).toBe(1);
      expect(focused).toBe(1);
    }finally{
      if(prior)Object.defineProperty(globalThis,"window",prior);
      else Reflect.deleteProperty(globalThis,"window");
    }
  });

  test("79 source routes, eight staging-only and two drafts produce four honest UAT statuses",()=>{
    const csv=createManualUatCsv(MANUAL_DOCUMENTED_SCREENS);
    expect(readFileSync(join(root,"docs/MANUAL_SCREENSHOT_UAT_TEMPLATE_20261120.csv"),"utf8")).toBe(csv.replaceAll("\r\n","\n"));
    const lines=csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(90);
    expect(MANUAL_UAT_HEADER).toHaveLength(15);
    expect(lines[0]).toContain("Source release SHA");
    expect(lines[0]).toContain("Role and direct URL UAT");
    expect(lines[1]).toContain("vg-001-home-desktop.png");
    expect(lines[1]).toContain("vg-001-home-mobile.png");
    expect(lines[1]).not.toContain("PASS");
    expect((csv.match(/NOT_TESTED/g)??[]).length).toBe(74*4);
    expect((csv.match(/BLOCKED_NOT_IN_STAGING/g)??[]).length).toBe(5*4);
    expect((csv.match(/BLOCKED_STAGING_PARITY/g)??[]).length).toBe(8*4);
    expect((csv.match(/BLOCKED_PENDING_RELEASE/g)??[]).length).toBe(2*4);
    expect(lines[80]).toContain("BLOCKED_STAGING_PARITY");
    expect(lines[87]).toContain("BLOCKED_STAGING_PARITY");
    expect(lines[88]).toContain("BLOCKED_PENDING_RELEASE");
    expect(lines[89]).toContain("BLOCKED_PENDING_RELEASE");
    for(const screen of MANUAL_DOCUMENTED_SCREENS){
      expect(csv).toContain(screen.path);
      expect(csv).toContain(screen.title);
    }
    expect(csv).not.toContain("approval granted");
    const tampered=createManualUatCsv([{...MANUAL_SCREENS[0]!,title:'=HYPERLINK("https://invalid.test","bad")'}]);
    expect(tampered).toContain("\"'=HYPERLINK");
    expect(tampered).not.toContain("\"=HYPERLINK");
    expect(()=>downloadManualUatCsv("customer",MANUAL_SCREENS)).toThrow(/Administrator/);
    expect(()=>downloadManualUatCsv("cashier",MANUAL_SCREENS)).toThrow(/Administrator/);
  });

  test("inspected staging manifest is reconciled as eight staged-only and five source-only routes",()=>{
    expect(MANUAL_SCREENS).toHaveLength(79);
    expect(MANUAL_STAGING_SCREENS).toHaveLength(8);
    expect(MANUAL_SOURCE_ONLY_PATHS).toHaveLength(5);
    expect(MANUAL_DOCUMENTED_SCREENS).toHaveLength(89);
    expect(MANUAL_STAGING_SCREENS.map(x=>x.path).sort()).toEqual([
      "/admin/inventory/lots",
      "/admin/pos/till-operations",
      "/admin/support",
      "/staff/cashier",
      "/staff/demo/[role]",
      "/staff/pos",
      "/support",
      "/uat",
    ].sort());
    for(const page of MANUAL_STAGING_SCREENS){
      expect(page.readiness).toBe("staging");
      expect(page.releaseSource).toContain("107fc4f");
      expect(MANUAL_SCREENS.some(s=>s.path===page.path)).toBe(false);
      const sourcePage=join(root,"src/app",page.path==="/support"?"(storefront)/support":page.path.slice(1),"page.tsx");
      expect(existsSync(sourcePage)).toBe(false);
    }
    for(const path of MANUAL_SOURCE_ONLY_PATHS){
      const page=MANUAL_SCREENS.find(x=>x.path===path);
      expect(page?.readiness).toBe("absent");
      expect(page?.releaseSource).toContain("107fc4f");
    }
    const md=readFileSync(join(root,"docs/ROLE_BASED_SYSTEM_MANUAL_20261120.md"),"utf8");
    expect((md.match(/^```mermaid$/gm)??[])).toHaveLength(101);
    expect(md).toContain("82 deployed pages");
  });

  test("POS read-only draft guides remain outside the 79 canonical source routes",()=>{
    expect(MANUAL_SCREENS).toHaveLength(79);
    expect(MANUAL_PENDING_SCREENS.map(s=>s.path)).toEqual([
      "/admin/pos/verified-uat/history",
      "/admin/pos/verified-uat/reconciliation",
    ]);
    const exported=createOfflineManualHtml("admin",screensForRole("admin"),workflowsForRole("admin"));
    for(const screen of MANUAL_PENDING_SCREENS){
      expect(screen.audience).toBe("admin");
      expect(screen.readiness).toBe("pending");
      expect(screen.releaseSource).toContain("PR #175");
      expect(MANUAL_SCREENS.some(s=>s.path===screen.path)).toBe(false);
      expect(existsSync(join(root,"src/app",screen.path.slice(1),"page.tsx"))).toBe(false);
      expect(exported).toContain(screen.path);
    }
    expect(exported).toContain("Not yet an approved release route");
    expect(exported).toContain("Manual link disabled pending reviewed release-pair parity");
    for(const role of ["customer","cashier","inventory_manager","rider"] as const){
      const edition=createOfflineManualHtml(role,screensForRole(role),workflowsForRole(role));
      for(const screen of MANUAL_PENDING_SCREENS)expect(edition).not.toContain(screen.path);
    }
    const reader=readFileSync(join(root,"src/features/manual/reader.tsx"),"utf8");
    expect(reader).toContain("Screen link intentionally disabled");
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
    expect(reader).toContain("downloadManualUatCsv");
    expect(reader).toContain('role==="admin"&&authenticated&&!checking');
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
