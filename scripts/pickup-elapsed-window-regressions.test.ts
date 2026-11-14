/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { classifyPickupAppointmentWindow } from "../src/features/logistics/pickup-appointment-window";

const window = {
  status: "booked",
  startsAt: "2026-11-14T11:00:00.000Z",
  endsAt: "2026-11-14T11:30:00.000Z",
};

describe("Pickup appointment timing is advisory, never a payment or collection outcome", () => {
  test("booked window boundary is inclusive at start and elapsed at end", () => {
    expect(classifyPickupAppointmentWindow(window, Date.parse("2026-11-14T10:59:59.999Z"))).toBe("upcoming");
    expect(classifyPickupAppointmentWindow(window, Date.parse(window.startsAt))).toBe("open");
    expect(classifyPickupAppointmentWindow(window, Date.parse("2026-11-14T11:29:59.999Z"))).toBe("open");
    expect(classifyPickupAppointmentWindow(window, Date.parse(window.endsAt))).toBe("elapsed");
  });

  test("missing client clock, invalid dates and unsupported status never claim a no-show", () => {
    expect(classifyPickupAppointmentWindow(window, null)).toBe("unassessed");
    expect(classifyPickupAppointmentWindow(window, Number.NaN)).toBe("unassessed");
    expect(classifyPickupAppointmentWindow(null, Date.now())).toBe("none");
    expect(classifyPickupAppointmentWindow({ ...window, startsAt: "invalid" }, Date.now())).toBe("unassessed");
    expect(classifyPickupAppointmentWindow({ ...window, endsAt: window.startsAt }, Date.now())).toBe("unassessed");
    expect(classifyPickupAppointmentWindow({ ...window, status: "missed" }, Date.now())).toBe("unassessed");
  });

  test("server-authoritative completed and cancelled states are never overwritten by the clock", () => {
    expect(classifyPickupAppointmentWindow({ ...window, status: "completed" }, Date.parse(window.startsAt))).toBe("completed");
    expect(classifyPickupAppointmentWindow({ ...window, status: "cancelled" }, Date.parse(window.endsAt))).toBe("cancelled");
  });

  test("customer screen offers honest rebooking guidance, without presenting a no-show as automatic cancellation", () => {
    const source = readFileSync("src/components/orders/pickup-appointment-manager.tsx", "utf8");
    expect(source).toContain('windowState === "elapsed"');
    expect(source).toContain("Your scheduled collection window has passed.");
    expect(source).toContain("not been automatically cancelled, collected or refunded");
    expect(source).toContain("apiOps.pickupAppointmentBook");
    expect(source).toContain('role="status"');
  });
});
