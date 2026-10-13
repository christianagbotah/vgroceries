/**
 * Delivery engine — dispatch assignment, rider job lifecycle, proof of
 * delivery, failed-delivery handling and honest COD context.
 *
 * Domain rules (aligned with the Fulfilment + Stock Handover Authority #12):
 * - Physical stock is consumed exactly ONCE at the authoritative fulfilment
 *   handover (store custody -> dispatch custody). Dispatch begins after that.
 * - NO rider/dispatch action consumes or restores stock: not assignment,
 *   not pickup, not delivery, not failure, not return-to-store.
 * - Delivery completion and COD payment are separate concerns. This engine
 *   never marks a COD order paid; a future COD cash/remittance authority owns
 *   that financial flow (UI shows read-only "collection authority pending").
 * - Return-to-store is an operational exception awaiting Returns inspection;
 *   sellable stock is never silently restored.
 */

import type { DeliveryJob, DeliveryStatus } from "@/types/domain";
import { nextId, nowIso } from "@/lib/id";
import type { VgStore } from "../store";
import { OpError, audit, mustOrder, orderEvent } from "./orders";

const DELIVERY_NEXT: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  unassigned: ["assigned"],
  assigned: ["accepted", "unassigned"],
  accepted: ["picked_up", "failed"],
  picked_up: ["out_for_delivery", "failed", "return_to_store"],
  out_for_delivery: ["delivered", "failed", "return_to_store"],
  failed: ["rescheduled", "return_to_store"],
  rescheduled: ["out_for_delivery", "return_to_store"],
};

function requireDeliveryTransition(job: DeliveryJob, to: DeliveryStatus): void {
  if (job.status === to) return;
  const allowed = DELIVERY_NEXT[job.status] ?? [];
  if (!allowed.includes(to)) {
    throw new OpError("VALIDATION_FAILED", `Cannot move delivery job from ${job.status} to ${to}.`);
  }
}

function jobEvent(job: DeliveryJob, actor: string, action: string, note?: string): void {
  job.events.push({ at: nowIso(), actor, action, note });
}

export function mustJob(store: VgStore, jobId: string): DeliveryJob {
  const job = store.deliveryJobs.find((j) => j.id === jobId);
  if (!job) throw new OpError("VALIDATION_FAILED", "Delivery job not found.");
  return job;
}

/**
 * Queue of delivery orders that have ALREADY PASSED the authoritative
 * fulfilment handover (fulfilmentStatus = dispatched, stock consumed exactly
 * once) and are waiting for dispatch assignment.
 */
export function dispatchQueue(store: VgStore): { order: ReturnType<typeof mustOrder>; job?: DeliveryJob }[] {
  const out: { order: ReturnType<typeof mustOrder>; job?: DeliveryJob }[] = [];
  for (const order of store.orders) {
    if (order.channel !== "online" || order.fulfilment !== "delivery") continue;
    // Only orders already handed over to dispatch custody belong here. The
    // fulfilment handover (not assignment) is the stock depletion point.
    if (order.fulfilmentStatus !== "dispatched") continue;
    if (!order.stockConsumedAt) continue;
    const job = store.deliveryJobs.find((j) => j.orderId === order.id);
    if (job && !["unassigned", "rescheduled", "failed"].includes(job.status)) continue;
    out.push({ order, job });
  }
  return out;
}

export function assignJob(
  store: VgStore,
  orderId: string,
  target: { riderId?: string; providerId?: string; manual?: boolean },
  actor: string
): DeliveryJob {
  const order = mustOrder(store, orderId);
  // Assignment is NOT the fulfilment handover. The order must already be in
  // dispatch custody (handed over + stock consumed) before it can be assigned.
  if (order.fulfilmentStatus !== "dispatched" || !order.stockConsumedAt) {
    throw new OpError(
      "VALIDATION_FAILED",
      "Only orders that have completed the fulfilment handover (stock already consumed) can be assigned to a rider or provider."
    );
  }
  let job = store.deliveryJobs.find((j) => j.orderId === order.id);
  if (!job) {
    job = {
      id: nextId("job"),
      orderId: order.id,
      zoneId: order.zoneId ?? "zone_c",
      status: "unassigned",
      events: [],
      addressId: order.addressId,
      instructions: order.fulfilment === "delivery" ? undefined : undefined,
      cashToCollectMinor: order.paymentMethod === "cash_on_delivery" ? order.totalMinor : undefined,
    };
    store.deliveryJobs.push(job);
  }
  if (job.status !== "unassigned" && job.status !== "rescheduled" && job.status !== "failed") {
    throw new OpError("VALIDATION_FAILED", "Job is already assigned.");
  }

  if (target.riderId) {
    const rider = store.riders.find((r) => r.id === target.riderId);
    if (!rider) throw new OpError("VALIDATION_FAILED", "Rider not found.");
    if (!rider.isAvailable) {
      throw new OpError(
        "VALIDATION_FAILED",
        rider.activeJobId
          ? `${rider.name} is on an active delivery and cannot take another job.`
          : `${rider.name} is currently off duty / unavailable.`
      );
    }
    job.riderId = rider.id;
    job.providerId = undefined;
    job.isManualBooking = false;
    rider.isAvailable = false;
    rider.activeJobId = job.id;
  } else {
    job.riderId = undefined;
    job.providerId = target.providerId;
    job.isManualBooking = true; // manual third-party booking fallback
  }

  job.status = "assigned";
  job.rescheduledFor = undefined;
  job.assignedAt = nowIso();
  jobEvent(job, actor, target.riderId ? `Assigned to rider ${store.riders.find((r) => r.id === target.riderId)?.name}` : "Booked with external provider (manual)", target.providerId ? store.providers.find((p) => p.id === target.providerId)?.name : undefined);
  // Assignment records dispatch custody of an already-handed-over order. It
  // does NOT change fulfilmentStatus (stays "dispatched") and never touches stock.
  order.deliveryStatus = "assigned";
  orderEvent(order, actor, "Assigned to rider — inventory handover already completed", {});
  audit(store, actor, "delivery.assigned", "DeliveryJob", job.id, { after: target.riderId ?? target.providerId ?? "manual" });
  return job;
}

export function unassignJob(store: VgStore, jobId: string, actor: string, note?: string): DeliveryJob {
  const job = mustJob(store, jobId);
  if (!["assigned", "accepted"].includes(job.status)) {
    throw new OpError("VALIDATION_FAILED", "Only assigned or accepted jobs can be unassigned.");
  }
  job.status = "unassigned";
  if (job.riderId) freeRider(store, job.riderId);
  job.riderId = undefined;
  jobEvent(job, actor, "Unassigned — back in the assignment queue", note);
  const order = store.orders.find((o) => o.id === job.orderId);
  if (order) {
    order.deliveryStatus = "unassigned";
    orderEvent(order, actor, "Rider unassigned — awaiting new assignment", { note });
  }
  audit(store, actor, "delivery.unassigned", "DeliveryJob", job.id, { reason: note });
  return job;
}

export function riderAccept(store: VgStore, jobId: string, riderId: string): DeliveryJob {
  const job = mustJob(store, jobId);
  if (job.riderId !== riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
  if (job.status === "accepted") return job; // retry double-submit: strict no-op
  requireDeliveryTransition(job, "accepted");
  job.status = "accepted";
  jobEvent(job, riderId, "Job accepted by rider");
  syncOrderDelivery(store, job);
  return job;
}

/**
 * Rider picks up the handed-over order — a custody acknowledgement only.
 * Stock was already consumed exactly once at the fulfilment handover;
 * this action (and every later rider action) never touches sellable stock.
 */
export function riderPickup(store: VgStore, jobId: string, riderId: string): DeliveryJob {
  const job = mustJob(store, jobId);
  if (job.riderId !== riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
  if (job.status === "picked_up") return job; // retry double-submit: strict no-op
  requireDeliveryTransition(job, "picked_up");
  job.status = "picked_up";
  jobEvent(job, riderId, "Picked up from store — custody acknowledged (stock unchanged; consumed at handover)");
  syncOrderDelivery(store, job);
  return job;
}

export function riderOut(store: VgStore, jobId: string, riderId: string): DeliveryJob {
  const job = mustJob(store, jobId);
  if (job.riderId !== riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
  if (job.status === "out_for_delivery") return job; // retry double-submit: strict no-op
  requireDeliveryTransition(job, "out_for_delivery");
  job.status = "out_for_delivery";
  jobEvent(job, riderId, "Out for delivery");
  syncOrderDelivery(store, job);
  return job;
}

export interface DeliverInput {
  jobId: string;
  riderId: string;
  proof: { method: "pin" | "signature" | "photo_note"; detail: string };
  note?: string;
}

export function riderDeliver(store: VgStore, input: DeliverInput): DeliveryJob {
  const job = mustJob(store, input.jobId);
  if (job.riderId !== input.riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
  if (!input.proof?.detail?.trim()) throw new OpError("VALIDATION_FAILED", "Proof of delivery is required (PIN, signature or photo note).");
  if (job.status === "delivered") {
    // network-retry idempotency: an identical repeat is a strict no-op; a
    // DIFFERENT proof on an already-delivered job is a conflict, never a rewrite.
    if (job.proof?.detail === input.proof.detail.trim()) return job;
    throw new OpError("CONFLICT", "This job is already delivered with different proof — the recorded proof is never overwritten.");
  }
  requireDeliveryTransition(job, "delivered");
  job.status = "delivered";
  job.proof = { method: input.proof.method, detail: input.proof.detail, at: nowIso() };
  jobEvent(job, input.riderId, "Delivered", `proof: ${input.proof.method}`);
  const order = mustOrder(store, job.orderId);
  order.fulfilmentStatus = "delivered";
  order.deliveryStatus = "delivered";
  orderEvent(order, input.riderId, "Delivered to customer", { fromStatus: "dispatched", toStatus: "delivered", note: input.note });
  // COD: delivery completion is a delivery event ONLY. Payment for COD orders
  // stays under the future cash-collection/remittance authority — this engine
  // must never mark paymentStatus succeeded because goods were handed over.
  if (job.cashToCollectMinor) {
    jobEvent(job, input.riderId, "COD due on delivery — collection authority pending (cash ledger not connected)");
  }
  freeRider(store, input.riderId);
  audit(store, input.riderId, "delivery.delivered", "DeliveryJob", job.id, { reason: `proof: ${input.proof.method}` });
  return job;
}

export function riderFail(store: VgStore, jobId: string, riderId: string, reason: string): DeliveryJob {
  const job = mustJob(store, jobId);
  if (job.riderId !== riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
  requireDeliveryTransition(job, "failed");
  if (!reason.trim()) throw new OpError("VALIDATION_FAILED", "A failure reason is required.");
  job.status = "failed";
  job.failureReason = reason;
  jobEvent(job, riderId, "Delivery failed", reason);
  const order = mustOrder(store, job.orderId);
  order.deliveryStatus = "failed";
  orderEvent(order, riderId, "Delivery attempt failed", { note: reason });
  // stock is NOT re-added: goods are with the rider / back in store awaiting inspection
  return job;
}

export function rescheduleJob(store: VgStore, jobId: string, when: string, actor: string): DeliveryJob {
  const job = mustJob(store, jobId);
  requireDeliveryTransition(job, "rescheduled");
  job.status = "rescheduled";
  job.rescheduledFor = when;
  jobEvent(job, actor, "Rescheduled", when);
  const order = mustOrder(store, job.orderId);
  order.deliveryStatus = "rescheduled";
  orderEvent(order, actor, "Delivery rescheduled", { note: when });
  audit(store, actor, "delivery.rescheduled", "DeliveryJob", job.id, { reason: when });
  return job;
}

/** Goods come back to the store; they enter quarantine — sellable stock is never silently re-added (future Returns Authority decides disposition). */
export function returnToStore(store: VgStore, jobId: string, actor: string, note?: string): DeliveryJob {
  const job = mustJob(store, jobId);
  requireDeliveryTransition(job, "return_to_store");
  job.status = "return_to_store";
  jobEvent(job, actor, "Returned to store — awaiting Returns inspection (no stock re-add)", note);
  const order = mustOrder(store, job.orderId);
  order.deliveryStatus = "return_to_store";
  orderEvent(order, actor, "Delivery returned to store", { note: "Goods quarantined — Returns inspection decides restock, quarantine or damage; sellable stock unchanged until then" });
  if (job.riderId) freeRider(store, job.riderId);
  audit(store, actor, "delivery.return_to_store", "DeliveryJob", job.id, { reason: note });
  return job;
}

function syncOrderDelivery(store: VgStore, job: DeliveryJob): void {
  const order = store.orders.find((o) => o.id === job.orderId);
  if (order) order.deliveryStatus = job.status;
}

function freeRider(store: VgStore, riderId: string): void {
  const rider = store.riders.find((r) => r.id === riderId);
  if (rider) {
    rider.isAvailable = true;
    rider.activeJobId = undefined;
  }
}

export function riderJobs(store: VgStore, riderId: string): DeliveryJob[] {
  return store.deliveryJobs.filter(
    (j) => j.riderId === riderId && !["delivered", "return_to_store"].includes(j.status)
  );
}

export function riderHistory(store: VgStore, riderId: string): DeliveryJob[] {
  return store.deliveryJobs.filter(
    (j) => j.riderId === riderId && ["delivered", "return_to_store"].includes(j.status)
  );
}

/**
 * COD context projection — read-only operational context for demo parity.
 * This is NOT a financial ledger: cash collection and rider remittance belong
 * to a future COD cash authority. Exposed only as an honest pending state.
 */
export function codCashContext(store: VgStore, riderId: string): { jobsWithCash: number; totalDueMinor: number } {
  const jobs = store.deliveryJobs.filter((j) => j.riderId === riderId && j.cashToCollectMinor);
  return {
    jobsWithCash: jobs.length,
    totalDueMinor: jobs.reduce((a, j) => a + (j.cashToCollectMinor ?? 0), 0),
  };
}
