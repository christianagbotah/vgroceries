/// <reference types="bun-types" />
import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {
  pickupCentreClosureInputSchema,pickupCentreClosureViewSchema,
  pickupCentreClosureListSchema,
} from "../packages/contracts/src/pickup-appointments";
import {validateRequest} from "../packages/contracts/src/validation";
import {restEndpoints} from "../packages/contracts/src/endpoints";
import {readTags,invalidatesTags} from "../src/services/operation-registry";
import {MockServiceAdapter} from "../src/services/adapters/mock";

describe("Pickup centre local-calendar closures",()=>{
  test("requires actual date, explicit closed boolean and a reason only for closure",()=>{
    const good={date:"2026-12-26",closed:true,reason:"Public holiday"};
    expect(pickupCentreClosureInputSchema.safeParse(good).success).toBe(true);
    for(const invalid of [
      {...good,date:"2026-02-31"}, {...good,date:"Dec 26"}, {...good,reason:"x"},
      {...good,reason:null}, {...good,reason:"a".repeat(161)},
      {...good,closed:false}, {...good,extra:"bypass"},
    ]) expect(pickupCentreClosureInputSchema.safeParse(invalid).success).toBe(false);
    expect(pickupCentreClosureInputSchema.safeParse({date:"2026-12-26",closed:false,reason:null}).success).toBe(true);
    expect(validateRequest("admin.logistics.pickup-closures.save",{...good,idempotencyKey:"close-001"}).ok).toBe(true);
  });
  test("strict calendar response excludes internal actors and customer identifiers",()=>{
    const valid={nodeId:"pickup-cnt",date:"2026-12-26",closed:true,reason:"Staff holiday",updatedAt:"2026-11-09T09:00:00Z"};
    expect(pickupCentreClosureViewSchema.safeParse(valid).success).toBe(true);
    expect(pickupCentreClosureListSchema.safeParse([valid]).success).toBe(true);
    expect(pickupCentreClosureViewSchema.safeParse({...valid,updatedBy:"secret"}).success).toBe(false);
    expect(pickupCentreClosureViewSchema.safeParse({...valid,customerId:"someone"}).success).toBe(false);
  });
  test("one shared authenticated server route has replay-safe admin mutation",()=>{
    expect(restEndpoints["admin.logistics.pickup-closures"].path)
      .toBe("/admin/logistics/nodes/{nodeId}/pickup-closures");
    expect(restEndpoints["admin.logistics.pickup-closures.save"].method).toBe("POST");
    expect(readTags("admin.logistics.pickup-closures")).toContain("logistics");
    expect(invalidatesTags("admin.logistics.pickup-closures.save")).toContain("orders");
  });
  test("development mock never fabricates closure authority or holiday response",async()=>{
    const mock=new MockServiceAdapter();
    expect(await mock.request<unknown[]>({op:"admin.logistics.pickup-closures",query:{nodeId:"fake"}})).toEqual([]);
    await expect(mock.request({op:"admin.logistics.pickup-closures.save",
      query:{nodeId:"fake"},body:{date:"2026-12-26",closed:true,reason:"Public holiday"},
      idempotencyKey:"closure-test-123",
    })).rejects.toMatchObject({code:"UNAVAILABLE"});
  });
  test("admin can manage closure days but customers see no staff reason",()=>{
    const admin=readFileSync("src/features/logistics/pickup-centre-closure-calendar.tsx","utf8");
    const policy=readFileSync("src/features/logistics/pickup-appointment-policy-editor.tsx","utf8");
    const customer=readFileSync("src/components/orders/pickup-appointment-manager.tsx","utf8");
    expect(admin).toContain("pickupCentreClosureSave");
    expect(admin).toContain('type="date"');
    expect(admin).toContain("Reopen");
    expect(policy).toContain("PickupCentreClosureCalendar");
    expect(customer).not.toContain("pickupCentreClosureSave");
  });
});
