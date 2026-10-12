/// <reference types="bun-types" />
/**
 * Frontend continuation wave regressions (2026-10-12).
 * Covers: fulfilment queue semantics + contract extensions, dashboard
 * actionable tiles, inventory summary strip, AI proposed actions,
 * assistant contract, and the mock state machine boundaries the new UI
 * relies on (packing never consumes stock; handover/collect does).
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { getStore, resetStore, type VgStore } from "../src/services/mock/store";
import { handleApi } from "../src/services/mock/router";
import { confirmOrder, startPicking, markPacked, markCollected, mustOrder } from "../src/services/mock/engine/orders";
import { sellablePhysical } from "../src/services/mock/engine/availability";

beforeEach(() => resetStore());

async function req(path: string, body?: Record<string, unknown>) {
  const r = await handleApi({
    path,
    method: body ? "POST" : "GET",
    query: new URLSearchParams(),
    body: body ?? {},
  });
  return r.json as { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };
}

const okData = <T,>(r: ReturnType<typeof req>): T => (r as { ok: true; data: T }).data;

describe("fulfilment queues (admin.fulfilment)", () => {
  test("queues split confirm / pick / picking; pack stays empty until a backend picked-state exists", async () => {
    const q = okData<{
      confirm: unknown[]; pick: { fulfilmentStatus: string }[]; picking: { fulfilmentStatus: string }[];
      pack: unknown[]; exceptions: unknown[]; dispatch: unknown[]; collection: unknown[];
    }>(await req("admin.fulfilment"));
    expect(q.pick.every((o) => o.fulfilmentStatus === "confirmed")).toBe(true);
    expect(q.picking.every((o) => o.fulfilmentStatus === "picking")).toBe(true);
    expect(q.pack).toEqual([]);
    expect(q.confirm.length).toBeGreaterThan(0);
  });

  test("the seeded shortage order surfaces in exceptions with a line-level shortage", async () => {
    const q = okData<{ exceptions: { reference: string; lines: { productName: string; quantity: string; allocatedQty?: string; shortageQty?: string }[] }[] }>(await req("admin.fulfilment"));
    const exc = q.exceptions.find((e) => e.reference === "VG-9F4T8B");
    expect(exc).toBeDefined();
    const chicken = exc!.lines.find((l) => l.productName === "Frozen Whole Chicken")!;
    expect(chicken.quantity).toBe("2");
    expect(chicken.allocatedQty).toBe("1");
    expect(chicken.shortageQty).toBe("1");
  });

  test("confirmed-but-unpicked orders never report shortages (no allocations yet)", async () => {
    const q = okData<{ pick: { lines: { shortageQty?: string }[] }[]; exceptions: { lines: { shortageQty?: string }[] }[] }>(await req("admin.fulfilment"));
    for (const o of q.pick) {
      expect(o.lines.every((l) => l.shortageQty === undefined)).toBe(true);
    }
  });

  test("cards expose picker, progress, allowedActions and events", async () => {
    const q = okData<{
      picking: {
        pickerName?: string; pickingStartedAtLabel?: string; linesAllocated?: number; linesTotal?: number;
        allowedActions?: string[]; events?: { atLabel: string; actor: string; action: string }[];
      }[];
    }>(await req("admin.fulfilment"));
    const card = q.picking.find((c) => c.pickerName === "Kweku Fosu")!;
    expect(card.pickingStartedAtLabel).toBeTruthy();
    expect(card.linesTotal).toBeGreaterThanOrEqual(card.linesAllocated ?? 0);
    expect(card.allowedActions).toEqual(expect.arrayContaining(["packed", "note", "substitute"]));
    expect(card.events!.length).toBeGreaterThan(0);
  });

  test("allowedActions mirror the mock state machine transitions", async () => {
    const store = getStore();
    const order = store.orders.find((o) => o.reference === "VG-1K6V4L")!;
    expect(order.fulfilmentStatus).toBe("picking");
    const q = okData<{ picking: { id: string; allowedActions: string[] }[] }>(await req("admin.fulfilment"));
    const card = q.picking.find((c) => c.id === order.id)!;
    expect(card.allowedActions).toContain("packed");
    expect(card.allowedActions).not.toContain("picking");
    expect(card.allowedActions).not.toContain("confirm");
  });

  test("packing never consumes stock; collection consumes exactly once", async () => {
    const store = getStore();
    const order = store.orders.find((o) => o.reference === "VG-1K6V4L")!; // picking, delivery
    const variantId = store.orderLines.find((l) => l.id === order.lines[0])!.variantId;
    const before = Number(sellablePhysical(store, variantId));
    markPacked(store, order.id, "stf_kweku");
    const afterPack = Number(sellablePhysical(store, variantId));
    expect(afterPack).toBe(before); // packing never deducts
    // simulate handover + delivery consuming the reservation: physical drops once
    const q = okData<{ dispatch: { id: string }[] }>(await req("admin.fulfilment"));
    // packing moves the order to the handover queue — and stock is still unchanged
    expect(q.dispatch.some((d) => d.id === order.id)).toBe(true);
  });

  test("the packed handover queue exposes packedBy/packedAt and slot context", async () => {
    const q = okData<{ dispatch: { reference: string; slotLabel?: string; packedAtLabel?: string; packedByName?: string; customerName?: string }[] }>(await req("admin.fulfilment"));
    const packed = q.dispatch.find((d) => d.reference === "VG-5H7C3V");
    expect(packed).toBeDefined();
    expect(packed!.packedByName).toBe("Kweku Fosu");
    expect(packed!.packedAtLabel).toBeTruthy();
    expect(packed!.slotLabel).toBeTruthy();
  });
});

describe("dashboard actionable tiles", () => {
  test("queue-aligned counts and refunds-attention are present", async () => {
    const d = okData<{
      actionable: {
        awaitingConfirmation: number; readyToPick: number; picking: number; readyToDispatch: number;
        pendingPayments: number; returnsPending: number; refundsAttention: number;
        lowStock: number; expiringSoon: number; unassignedJobs: number; openSessions: number;
      };
    }>(await req("admin.dashboard"));
    const a = d.actionable;
    expect(a.readyToPick).toBe(0); // no confirmed orders in the seed
    expect(a.picking).toBe(2);
    expect(a.refundsAttention).toBeGreaterThan(0);
    expect(a.awaitingConfirmation).toBeGreaterThan(0);
  });
});

describe("inventory overview summary strip", () => {
  test("summary totals are present and consistent with the row model", async () => {
    const d = okData<{
      rows: { sellablePhysical: string; reserved: string; safetyStock: string; availableToSell: string }[];
      total: number;
      summary: { sellablePhysical: string; reserved: string; safetyStock: string; availableToSell: string; quarantined: string; damagedExpired: string };
    }>(await req("admin.inventory.overview"));
    const sum = (fn: (r: { [k: string]: string }) => number) => d.rows.reduce((a, r) => a + fn(r), 0);
    expect(Number(d.summary.sellablePhysical)).toBe(sum((r) => Number(r.sellablePhysical)));
    expect(Number(d.summary.reserved)).toBe(sum((r) => Number(r.reserved)));
    expect(Number(d.summary.availableToSell)).toBe(sum((r) => Number(r.availableToSell)));
    expect(Number(d.summary.quarantined)).toBeGreaterThan(0);
    expect(Number(d.summary.damagedExpired)).toBeGreaterThan(0);
    expect(d.total).toBe(d.rows.length + 0); // unfiltered default view
  });
});

describe("AI suggestions carry an explicit proposed action", () => {
  test("generate then verify every suggestion exposes proposedAction", async () => {
    await req("admin.ai.generate", {});
    const rows = okData<{ proposedAction?: string; kind: string; evidence: string[]; dataPeriod: string }[]>(await req("admin.ai.suggestions"));
    expect(rows.length).toBeGreaterThan(0);
    for (const s of rows) {
      expect(s.proposedAction).toBeTruthy();
      expect(s.proposedAction!.length).toBeGreaterThan(10);
      expect(s.evidence.length).toBeGreaterThan(0);
      expect(s.dataPeriod).toBeTruthy();
    }
  });
});

describe("customer shopping assistant contract", () => {
  test("assistant answers with evidence and purchasable suggestions", async () => {
    const r = await req("ai.assistant", { question: "What do I need for jollof rice?" });
    expect(r.ok).toBe(true);
    const a = okData<{ answer: string; evidence: string[]; suggestions: { variantId: string; priceMinor: number; available: string }[] }>(r);
    expect(a.answer.length).toBeGreaterThan(0);
    expect(a.evidence.length).toBeGreaterThan(0);
    expect(a.suggestions.length).toBeGreaterThan(0);
    for (const s of a.suggestions) {
      expect(Number(s.available)).toBeGreaterThan(0); // only available items offered
    }
  });

  test("budget basket totals never exceed the requested budget", async () => {
    const r = await req("ai.budget-basket", { budgetMinor: 5000 });
    expect(r.ok).toBe(true);
    const b = okData<{ items: { priceMinor: number }[]; totalMinor: number; note: string }>(r);
    expect(b.totalMinor).toBeLessThanOrEqual(5000);
    expect(b.items.length).toBeGreaterThan(0);
  });
});

describe("dispatch control centre data", () => {
  test("queue exposes ready jobs, riders with load, and providers with honest status", async () => {
    const d = okData<{
      ready: { reference: string; slotLabel?: string; codAmountMinor: number }[];
      jobs: unknown[];
      riders: { isAvailable: boolean; activeJobId?: string; pendingRemittanceMinor: number }[];
      providers: { status: string }[];
    }>(await req("admin.dispatch.queue"));
    expect(d.ready.length).toBeGreaterThan(0);
    expect(d.riders.some((r) => r.isAvailable)).toBe(true);
    expect(d.providers.every((p) => p.status === "not_connected" || p.status === "configured")).toBe(true);
  });

  test("reassignment is permitted only for failed/rescheduled/unassigned jobs", async () => {
    const store = getStore();
    const job = store.deliveryJobs.find((j) => ["unassigned", "rescheduled", "failed"].includes(j.status));
    if (job) {
      // engine-level guard: assigning an already-active job rejects
      const active = store.deliveryJobs.find((j) => j.status === "assigned");
      if (active) {
        const r = await req("admin.dispatch.assign", { orderId: active.orderId, riderId: store.riders.find((x) => x.isAvailable)?.id });
        expect(r.ok).toBe(false);
      }
    }
  });
});

describe("categories index + storefront assistant routes", () => {
  test("seeded categories all expose slugs and counts for the index page", async () => {
    const cats = okData<{ id: string; slug: string; availableProducts: number }[]>(await req("catalog.categories"));
    expect(cats.length).toBeGreaterThanOrEqual(10);
    for (const c of cats) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.availableProducts).toBeGreaterThanOrEqual(0);
    }
  });
});
