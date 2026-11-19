import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {incompatiblePickupBookingCount} from "../apps/api/src/logistics/pickup-appointment.policy-protection";

const policy = (updates = {})=>({
 active:true,serviceDays:[1,2,3,4,5,6,7],
 opensAt:"08:00",closesAt:"20:00",
 slotMinutes:30,capacity:2,minLeadMinutes:30,maxDaysAhead:7,...updates,
});
const one = {startsAt:new Date("2026-11-20T09:00:00Z"),endsAt:new Date("2026-11-20T09:30:00Z")};
const two = {startsAt:new Date("2026-11-20T09:00:00Z"),endsAt:new Date("2026-11-20T09:30:00Z")};

describe("pickup schedule changes protect customer reservations",()=>{
 test("existing compatible future bookings survive unchanged policy and operator shutdown",()=>{
   expect(incompatiblePickupBookingCount(policy(),[one,two])).toBe(0);
   expect(incompatiblePickupBookingCount(policy({active:false}),[one,two])).toBe(0);
 });
 test("removing a service weekday rejects all appointments on that day",()=>{
   expect(incompatiblePickupBookingCount(policy({serviceDays:[1,2,3,6,7]}),[one])).toBe(1);
 });
 test("new opening window, shorter hours and slot duration cannot invalidate bookings",()=>{
   expect(incompatiblePickupBookingCount(policy({opensAt:"10:00"}),[one])).toBe(1);
   expect(incompatiblePickupBookingCount(policy({closesAt:"09:00"}),[one])).toBe(1);
   expect(incompatiblePickupBookingCount(policy({slotMinutes:60}),[one])).toBe(1);
 });
 test("capacity reductions count all excess booked customers, not only first page",()=>{
   expect(incompatiblePickupBookingCount(policy({capacity:1}),[one,two])).toBe(1);
   expect(incompatiblePickupBookingCount(policy({capacity:2}),[one,two])).toBe(0);
 });
 test("booking lead and horizon restrict new slots, not existing customer commitments",()=>{
   expect(incompatiblePickupBookingCount(policy({minLeadMinutes:1440,maxDaysAhead:1}),[one])).toBe(0);
 });
 test("badly aligned or truncated booked intervals cannot be silently revalidated",()=>{
   expect(incompatiblePickupBookingCount(policy(),[
     {startsAt:new Date("2026-11-20T09:15:00Z"),endsAt:new Date("2026-11-20T09:45:00Z")},
     {startsAt:new Date("2026-11-20T09:00:00Z"),endsAt:new Date("2026-11-20T09:15:00Z")},
   ])).toBe(2);
 });
 test("policy writer and customer booking serialize on same database policy row",()=>{
   const source=readFileSync("apps/api/src/logistics/pickup-appointment.service.ts","utf8");
   expect(source).toContain('FROM "PickupAppointmentPolicy" WHERE "nodeId"=${nodeId} FOR UPDATE');
   expect(source).toContain('WHERE "nodeId"=${policy.nodeId} FOR SHARE');
   expect(source).toContain("incompatiblePickupBookingCount(input,existingBookings)");
   expect(source).toContain("PICKUP_POLICY_CONFLICTS_WITH_BOOKINGS");
   expect(source).not.toContain("cancelAppointmentOnPolicyChange");
 });
});
