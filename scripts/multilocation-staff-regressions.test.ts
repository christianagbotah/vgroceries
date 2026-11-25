import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {manageCashierSchema} from "../packages/contracts/src/staff-management";

test("assignment contract accepts multiple unique locations but not role escalation",()=>{
 expect(manageCashierSchema.safeParse({action:"assign_locations",locationIds:["loc_accra","loc_kumasi"]}).success).toBe(true);
 for(const body of [
  {action:"assign_locations",locationIds:[]},
  {action:"assign_locations",locationIds:["a","a"]},
  {action:"assign_locations",locationIds:["a"],role:"admin"},
  {action:"assign_locations",locationIds:["a"],allLocations:true},
 ]) expect(manageCashierSchema.safeParse(body).success).toBe(false);
});
test("management remains admin guarded and rechecks target role under lock",()=>{
 const service=readFileSync("apps/api/src/staff-management/staff-management.service.ts","utf8");
 const controller=readFileSync("apps/api/src/staff-management/staff-management.controller.ts","utf8");
 expect(controller).toContain('request.actor.role !== "admin"');
 expect(service).toContain('role === "inventory_manager" && action === "assign_locations"');
 expect(service).toContain('FOR UPDATE');
 expect(service).toContain('canManageLocationAction(lockedRole, body.action)');
 expect(service).toContain('await this.assertActiveLocations(tx, body.locationIds)');
 expect(service).toContain('await tx.session.updateMany');
 expect(service).toContain('await tx.auditEvent.create');
});
