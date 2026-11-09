/// <reference types="bun-types" />
import { describe,expect,test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  pickupAppointmentPolicyInputSchema,pickupAppointmentOptionsSchema,
  bookPickupAppointmentRequestSchema,cancelPickupAppointmentRequestSchema,
} from "../packages/contracts/src/pickup-appointments";
import { validateRequest } from "../packages/contracts/src/validation";
import { restEndpoints } from "../packages/contracts/src/endpoints";
import { readTags,invalidatesTags } from "../src/services/operation-registry";
import { MockServiceAdapter } from "../src/services/adapters/mock";

const policy={
  active:false,serviceDays:[1,2,3,4,5],opensAt:"09:00",closesAt:"17:00",
  slotMinutes:30 as const,capacity:4,minLeadMinutes:60,maxDaysAhead:7,
};

describe("Pickup collection appointment contracts",()=>{
  test("policy is default-off and rejects invalid weekdays, overnight hours and capacity",()=>{
    expect(pickupAppointmentPolicyInputSchema.safeParse(policy).success).toBe(true);
    for(const bad of [
      {...policy,serviceDays:[1,1]}, {...policy,serviceDays:[]},
      {...policy,serviceDays:[0]}, {...policy,opensAt:"18:00",closesAt:"09:00"},
      {...policy,opensAt:"09:15"}, {...policy,slotMinutes:15},
      {...policy,capacity:0}, {...policy,capacity:51}, {...policy,maxDaysAhead:365},
    ]) expect(pickupAppointmentPolicyInputSchema.safeParse(bad).success).toBe(false);
  });
  test("booking requires ISO time and cancellation is a strict empty request",()=>{
    expect(bookPickupAppointmentRequestSchema.safeParse({startsAt:"2026-11-09T10:00:00.000Z"}).success).toBe(true);
    expect(bookPickupAppointmentRequestSchema.safeParse({startsAt:"Monday morning"}).success).toBe(false);
    expect(bookPickupAppointmentRequestSchema.safeParse({startsAt:"2026-11-09T10:00:00.000Z",nodeId:"fake"}).success).toBe(false);
    expect(cancelPickupAppointmentRequestSchema.safeParse({}).success).toBe(true);
    expect(cancelPickupAppointmentRequestSchema.safeParse({nodeId:"fake"}).success).toBe(false);
    expect(validateRequest("pickup.appointment.book",{startsAt:"2026-11-09T10:00:00Z",idempotencyKey:"booking-001"}).ok).toBe(true);
    expect(validateRequest("admin.logistics.pickup-policy.save",policy).ok).toBe(true);
  });
  test("options never claim slot authority unless enabled by server",()=>{
    expect(pickupAppointmentOptionsSchema.safeParse({
      enabled:false,ready:false,timezone:"Africa/Accra",slots:[],appointment:null,
    }).success).toBe(true);
    expect(pickupAppointmentOptionsSchema.safeParse({
      enabled:true,ready:true,timezone:"Europe/London",slots:[],appointment:null,
    }).success).toBe(false);
  });
  test("customer and admin routes map to the owned 126-path REST API",()=>{
    expect(restEndpoints["pickup.appointments"].path).toBe("/orders/{orderId}/pickup-appointments");
    expect(restEndpoints["pickup.appointment.book"].method).toBe("POST");
    expect(restEndpoints["pickup.appointment.cancel"].path).toBe("/orders/{orderId}/pickup-appointments/cancel");
    expect(restEndpoints["admin.logistics.pickup-policy"].path).toBe("/admin/logistics/nodes/{nodeId}/pickup-appointment-policy");
    expect(restEndpoints["admin.logistics.pickup-policy.save"].method).toBe("POST");
    expect(readTags("pickup.appointments")).toContain("orders");
    expect(invalidatesTags("pickup.appointment.book")).toContain("orders");
  });
  test("development mock cannot create collection appointments or fake policy",async()=>{
    const mock=new MockServiceAdapter();
    const empty=await mock.request<{enabled:boolean;ready:boolean;timezone:string;slots:unknown[];appointment:null}>({
      op:"pickup.appointments",query:{orderId:"mock-order"},
    });
    expect(empty).toEqual({enabled:false,ready:false,timezone:"Africa/Accra",slots:[],appointment:null});
    for(const op of ["pickup.appointment.book","pickup.appointment.cancel","admin.logistics.pickup-policy.save"]){
      await expect(mock.request({op,query:{orderId:"fake",nodeId:"fake"},
        body:op==="pickup.appointment.book"?{startsAt:"2026-11-09T10:00:00Z"}:op==="admin.logistics.pickup-policy.save"?policy:{},
        idempotencyKey:"never-fabricate-001",
      })).rejects.toMatchObject({code:"UNAVAILABLE"});
    }
  });
  test("customer UI distinguishes pickup appointment from transport window",()=>{
    const ui=readFileSync("src/components/orders/pickup-appointment-manager.tsx","utf8");
    const order=readFileSync("src/app/(storefront)/account/orders/[id]/page.tsx","utf8");
    const guest=readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx","utf8");
    const admin=readFileSync("src/features/logistics/pickup-appointment-policy-editor.tsx","utf8");
    expect(ui).toContain("collection appointment");
    expect(ui).toContain("options.ready");
    expect(ui).toContain("apiOps.pickupAppointmentBook");
    expect(ui).toContain("apiOps.pickupAppointmentCancel");
    expect(order).toContain("PickupAppointmentManager");
    expect(guest).toContain("PickupAppointmentManager");
    expect(admin).toContain("Save appointment policy");
  });
});
