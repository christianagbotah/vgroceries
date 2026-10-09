/**
 * Delivery engine — dispatch assignment, rider job lifecycle, proof of
 * delivery, cash-on-delivery collection/remittance as separate events,
 * and failed-delivery handling without phantom stock changes.
 */

import type { DeliveryJob, DeliveryStatus, Rider } from "@/types/domain";
import { nextId, nowIso } from "@/lib/id";
import type { VgStore } from "../store";
import { OpError, audit, consumeOrderStock, mustOrder, orderEvent } from "./orders";

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

/** Queue of packed orders that need delivery assignment. */
export function dispatchQueue(store: VgStore): { order: ReturnType<typeof mustOrder>; job?: DeliveryJob }[] {
  const out: { order: ReturnType<typeof mustOrder>; job?: DeliveryJob }[] = [];
  for (const order of store.orders) {
    if (order.channel !== "online" || order.fulfilment !== "delivery") continue;
    if (!["packed", "dispatched"].includes(order.fulfilmentStatus)) continue;
    if (["cancelled"].includes(order.fulfilmentStatus)) continue;
    const job = store.deliveryJobs.find((j) => j.orderId === order.id);
    if (job && !["unassigned", "rescheduled"].includes(job.status)) continue;
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
  if (!["packed", "dispatched"].includes(order.fulfilmentStatus)) {
    throw new OpError("VALIDATION_FAILED", "Only packed (or already dispatched) orders can be assigned.");
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
    if (!rider.isAvailable) throw new OpError("VALIDATION_FAILED", `${rider.name} is not available right now.`);
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
  order.fulfilmentStatus = "dispatched";
  order.deliveryStatus = "assigned";
  orderEvent(order, actor, "Dispatched and assigned", { fromStatus: "packed", toStatus: "dispatched" });
  audit(store, actor, "delivery.assigned", "DeliveryJob", job.id, { after: target.riderId ?? target.providerId ?? "manual" });
  return job;
}

export function riderAccept(store: VgStore, jobId: string, riderId: string): DeliveryJob {
  const job = mustJob(store, jobId);
  if (job.riderId !== riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
  requireDeliveryTransition(job, "accepted");
  job.status = "accepted";
  jobEvent(job, riderId, "Job accepted by rider");
  syncOrderDelivery(store, job);
  return job;
}

/** Rider picks up the packed order — this is the stock depletion point for delivery. */
export function riderPickup(store: VgStore, jobId: string, riderId: string): DeliveryJob {
  const job = mustJob(store, jobId);
  if (job.riderId !== riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
  requireDeliveryTransition(job, "picked_up");
  job.status = "picked_up";
  const order = mustOrder(store, job.orderId);
  const { consumed } = consumeOrderStock(store, order, riderId);
  jobEvent(job, riderId, consumed ? "Picked up from store; stock consumed" : "Repeat pickup ignored; stock already consumed once");
  syncOrderDelivery(store, job);
  return job;
}

export function riderOut(store: VgStore, jobId: string, riderId: string): DeliveryJob {
  const job = mustJob(store, jobId);
  if (job.riderId !== riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
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
  cashCollected?: boolean;
  note?: string;
}

export function riderDeliver(store: VgStore, input: DeliverInput): DeliveryJob {
  const job = mustJob(store, input.jobId);
  if (job.riderId !== input.riderId) throw new OpError("FORBIDDEN", "This job is not assigned to you.");
  requireDeliveryTransition(job, "delivered");
  if (!input.proof?.detail?.trim()) throw new OpError("VALIDATION_FAILED", "Proof of delivery is required (PIN, signature or photo note).");
  job.status = "delivered";
  job.proof = { method: input.proof.method, detail: input.proof.detail, at: nowIso() };
  jobEvent(job, input.riderId, "Delivered", `proof: ${input.proof.method}`);
  const order = mustOrder(store, job.orderId);
  order.fulfilmentStatus = "delivered";
  order.deliveryStatus = "delivered";
  orderEvent(order, input.riderId, "Delivered to customer", { fromStatus: "dispatched", toStatus: "delivered", note: input.note });
  // COD: delivery completion and cash collection are separate events
  if (job.cashToCollectMinor && input.cashCollected) {
    job.cashCollectedAt = nowIso();
    jobEvent(job, input.riderId, "Cash collected on delivery");
    order.paymentStatus = "succeeded";
    orderEvent(order, input.riderId, "Cash on delivery collected", { toStatus: "succeeded" });
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

/** Goods come back to the store; they enter quarantine — stock never silently re-enters sale. */
export function returnToStore(store: VgStore, jobId: string, actor: string, note?: string): DeliveryJob {
  const job = mustJob(store, jobId);
  requireDeliveryTransition(job, "return_to_store");
  job.status = "return_to_store";
  jobEvent(job, actor, "Returned to store; goods moved to quarantine for inspection", note);
  const order = mustOrder(store, job.orderId);
  order.deliveryStatus = "return_to_store";
  orderEvent(order, actor, "Delivery returned to store", { note: "Goods quarantined — no stock re-added until inspection approves restock" });
  if (job.riderId) freeRider(store, job.riderId);
  audit(store, actor, "delivery.return_to_store", "DeliveryJob", job.id, { reason: note });
  return job;
}

export function remitCash(store: VgStore, riderId: string, amountMinor: number, actor: string): Rider {
  const rider = store.riders.find((r) => r.id === riderId);
  if (!rider) throw new OpError("VALIDATION_FAILED", "Rider not found.");
  const pending = store.deliveryJobs.filter((j) => j.riderId === riderId && j.cashCollectedAt && !j.remittedAt);
  const total = pending.reduce((a, j) => a + (j.cashToCollectMinor ?? 0), 0);
  if (amountMinor !== total) {
    throw new OpError("VALIDATION_FAILED", `Collected but unremitted cash is ₵${(total / 100).toFixed(2)}. Enter the exact amount.`);
  }
  for (const j of pending) j.remittedAt = nowIso();
  audit(store, actor, "delivery.cash_remitted", "Rider", riderId, { after: `${amountMinor}` });
  return rider;
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

export function pendingRemittance(store: VgStore, riderId: string): { jobs: DeliveryJob[]; totalMinor: number } {
  const jobs = store.deliveryJobs.filter((j) => j.riderId === riderId && j.cashCollectedAt && !j.remittedAt);
  return { jobs, totalMinor: jobs.reduce((a, j) => a + (j.cashToCollectMinor ?? 0), 0) };
}
