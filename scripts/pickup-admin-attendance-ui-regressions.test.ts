/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  pickupAttendanceInputSchema, pickupAttendanceContextSchema,
  pickupAttendanceRecordSchema,
} from "../packages/contracts/src/pickup-attendance";
import { restEndpoints } from "../packages/contracts/src/endpoints";
import { requestSchemas } from "../packages/contracts/src/validation";

describe("Admin-only pickup attendance interface contracts", () => {
  test("late and missed reasons cannot be mixed, note length remains bounded", () => {
    expect(pickupAttendanceInputSchema.safeParse({ kind: "late_arrival", reason: "centre_delay" }).success).toBe(true);
    expect(pickupAttendanceInputSchema.safeParse({ kind: "missed_window", reason: "customer_not_present" }).success).toBe(true);
    expect(pickupAttendanceInputSchema.safeParse({ kind: "late_arrival", reason: "customer_not_present" }).success).toBe(false);
    expect(pickupAttendanceInputSchema.safeParse({ kind: "missed_window", reason: "centre_delay" }).success).toBe(false);
    expect(pickupAttendanceInputSchema.safeParse({ kind: "missed_window", reason: "other", note: "x".repeat(351) }).success).toBe(false);
    expect(pickupAttendanceInputSchema.safeParse({ kind: "missed_window", reason: "other", nodeId: "forged" }).success).toBe(false);
  });

  test("only authenticated admin endpoints exist; no fabricated demo observations", () => {
    expect(restEndpoints["admin.logistics.pickup-attendance"].path).toBe("/admin/logistics/orders/{orderId}/pickup-attendance");
    expect(restEndpoints["admin.logistics.pickup-attendance.context"].method).toBe("GET");
    expect(restEndpoints["admin.logistics.pickup-attendance.record"].method).toBe("POST");
    expect(requestSchemas["admin.logistics.pickup-attendance.record"]).toBeDefined();
    const mock = readFileSync("src/services/mock/router.ts", "utf8");
    expect(mock).toContain('case "admin.logistics.pickup-attendance.record":');
    expect(mock).toContain("Demo mode never fabricates attendance.");
  });

  test("client view is not confused with a physical collection receipt", () => {
    const view = readFileSync("src/features/logistics/pickup-attendance-panel.tsx", "utf8");
    const shipments = readFileSync("src/features/logistics/shipments-panel.tsx", "utf8");
    expect(view).toContain("Confirm permanent staff evidence");
    expect(view).toContain("will not mark the parcel collected");
    expect(view).toContain("ghanaTime(item.observedAt)");
    expect(view).toContain('className="mt-1 min-h-11"');
    expect(view).toContain("apiOps.pickupAttendanceContext(orderId)");
    expect(view).toContain("apiOps.pickupAttendanceRecord(orderId");
    expect(view).toContain("replayKey.current");
    expect(shipments).toContain("PickupAttendancePanel");
    expect(shipments).toContain('detail.destinationKind === "pickup_point"');
    expect(pickupAttendanceContextSchema.safeParse({
      enabled: false, canRecordLateArrival: false, canRecordMissedWindow: false, appointment: null,
    }).success).toBe(true);
    expect(pickupAttendanceRecordSchema.safeParse({ id: "fake" }).success).toBe(false);
  });
});
