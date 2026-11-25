import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {publicBusinessIdentitySchema} from "../packages/contracts/src/business-identity";
test("public identity accepts arbitrary legitimate business names and excludes private fields",()=>{
 expect(publicBusinessIdentitySchema.parse({businessName:"Example Electronics"})).toEqual({businessName:"Example Electronics"});
 for(const value of [{businessName:""},{businessName:"x\ny"},{businessName:"Store",registrationNumber:"private"},{businessName:"Store",credentials:{}}])expect(publicBusinessIdentitySchema.safeParse(value).success).toBe(false);
});
test("storefront identity is resolved once at layout and consumed by header/footer",()=>{
 const layout=readFileSync("src/app/(storefront)/layout.tsx","utf8");
 const shell=readFileSync("src/components/layout/storefront-shell.tsx","utf8");
 const controller=readFileSync("apps/api/src/admin-configuration/public-business.controller.ts","utf8");
 expect(layout).toContain("await getPublicBusinessIdentity()");
 expect(layout).toContain("<BusinessIdentityProvider identity={identity}>");
 expect(shell).toContain('businessName==="Variety Groceries"');
 expect(shell).toContain("Search {businessName}");
 expect(shell).toContain("{new Date().getFullYear()} {businessName}");
 expect(controller).toContain('select:{businessName:true}');
 expect(controller).toContain('@Get("business-contact")');
});
