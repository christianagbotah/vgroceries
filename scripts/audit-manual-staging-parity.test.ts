import {describe,expect,test} from "bun:test";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {
  compareManualRouteSets,discoverPageRoutes,routeFromPageArtifact,
} from "./audit-manual-staging-parity";
import {
  MANUAL_SCREENS,MANUAL_SOURCE_ONLY_PATHS,MANUAL_STAGING_SCREENS,
} from "../src/features/manual/catalogue";

describe("Read-only manual and deployed POS portal route parity",()=>{
  test("normalize route groups, root pages and dynamic records without conflating internals",()=>{
    expect(routeFromPageArtifact("page.tsx")).toBe("/");
    expect(routeFromPageArtifact("(storefront)/page.js")).toBe("/");
    expect(routeFromPageArtifact("(storefront)/products/[slug]/page.js")).toBe("/products/[slug]");
    expect(routeFromPageArtifact("admin/pos/till-operations/page.js")).toBe("/admin/pos/till-operations");
    expect(routeFromPageArtifact("admin/pos/till-operations/page.mjs")).toBeNull();
    expect(routeFromPageArtifact("_not-found/page.js")).toBeNull();
    expect(routeFromPageArtifact("@modal/help/page.js")).toBeNull();
  });

  test("walk a disposable build artifact tree without network or service access",()=>{
    const temp=mkdtempSync(join(tmpdir(),"vg-manual-parity-"));
    try{
      for(const path of ["(storefront)/page.js","admin/support/page.js","staff/pos/page.js","_not-found/page.js"]){
        const folder=join(temp,path.slice(0,path.lastIndexOf("/")));
        mkdirSync(folder,{recursive:true});
        writeFileSync(join(temp,path),"// test fixture\n");
      }
      expect(discoverPageRoutes(temp,"js")).toEqual(["/","/admin/support","/staff/pos"]);
    }finally{rmSync(temp,{recursive:true,force:true});}
  });

  test("match explicit staging and source-only route inventory without approving it",()=>{
    const result=compareManualRouteSets(
      ["/","/shop","/staff/rider/cod"],
      ["/","/shop","/staff/pos"],
      ["/staff/pos"],
      ["/staff/rider/cod"],
    );
    expect(result.canonicalCount).toBe(3);
    expect(result.stagingCount).toBe(3);
    expect(result.sharedCount).toBe(2);
    expect(result.stagingOnly).toEqual(["/staff/pos"]);
    expect(result.sourceOnly).toEqual(["/staff/rider/cod"]);
    expect(result.matchesReviewedSnapshot).toBe(true);
    expect(result.undocumentedStaging).toHaveLength(0);
    expect(result.unreviewedSourceOnly).toHaveLength(0);
  });

  test("fail closed for added, deleted or undocumented built routes",()=>{
    const result=compareManualRouteSets(
      ["/","/admin/payments","/staff/cashier"],
      ["/","/admin/payments","/admin/support","/uat"],
      ["/admin/support","/staff/pos"],
      ["/staff/cashier","/staff/rider/cod"],
    );
    expect(result.matchesReviewedSnapshot).toBe(false);
    expect(result.undocumentedStaging).toEqual(["/uat"]);
    expect(result.obsoleteStagingOverlays).toEqual(["/staff/pos"]);
    expect(result.obsoleteSourceOnlyOverlays).toEqual(["/staff/rider/cod"]);
  });

  test("every current application page remains accounted for, including manual exclusions",()=>{
    const current=discoverPageRoutes(resolve(import.meta.dir,"../src/app"),"tsx")
      .filter(path=>!["/manual","/rider/guide"].includes(path));
    expect(current).toEqual(MANUAL_SCREENS.map(s=>s.path).sort());
    expect(MANUAL_SOURCE_ONLY_PATHS).toHaveLength(5);
    expect(MANUAL_STAGING_SCREENS).toHaveLength(8);
    expect(new Set([...current,...MANUAL_STAGING_SCREENS.map(s=>s.path)]).size).toBe(87);
  });
});
