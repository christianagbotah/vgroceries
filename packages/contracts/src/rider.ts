/**
 * Shared API contracts — rider workspace (login, today's jobs, lifecycle
 * actions, delivery history). Mobile-first: this is the surface the future
 * React Native rider app will consume. Proposed REST rendering:
 * /api/v1/rider/* (see docs/openapi.yaml).
 *
 * Domain alignment (Fulfilment + Stock Handover Authority #12):
 * - Dispatch jobs start only after the authoritative fulfilment handover;
 *   rider actions (accept / pickup / out / deliver / fail) never mutate
 *   sellable stock — inventory was consumed exactly once at handover.
 * - Delivery completion requires proof and records a delivery event ONLY.
 *   COD cash collection and rider remittance are owned by a future COD
 *   cash authority and are deliberately absent from this contract.
 * - In production the backend derives rider identity from the session; the
 *   demo riderId parameter exists purely for mock/test parity and must never
 *   be treated as an authorization grant (documented in
 *   docs/ZAI_DISPATCH_RIDER_CONTRACT_GAPS.md).
 */

import type { DeliveryJob } from "./domain";

/** Demo login row — replaced by phone+PIN/OAuth in production. */
export interface RiderLoginRow {
  id: string;
  name: string;
  kind: string;
  vehicle: string;
  isDemo: boolean;
}

export interface RiderJobView {
  id: string;
  orderId: string;
  orderReference?: string;
  status: string;
  zone?: string;
  riderId?: string;
  instructions?: string;
  customerName?: string;
  customerPhone?: string;
  address?: { recipientName: string; phone: string; line1: string; landmark?: string; ghanaPostGps?: string };
  items: string[];
  /** COD due on delivery — read-only context; collection authority pending. */
  cashToCollectLabel?: string;
  cashToCollectMinor?: number;
  proof?: { method: string; detail: string; at: string };
  failureReason?: string;
  rescheduledFor?: string;
  events: { atLabel: string; actor: string; action: string; note?: string }[];
}

export interface RiderSelfView {
  id: string;
  name: string;
  phone: string;
  isAvailable: boolean;
  lastLocationAt?: string;
  lastLocationLabel?: string;
}

/** Read-only COD context for the rider dashboard — never a financial ledger. */
export interface RiderCodContext {
  /** Number of this rider's jobs carrying a COD amount. */
  jobsWithCash: number;
  /** Total COD due across those jobs (due on delivery, not collected state). */
  totalDueLabel: string;
  /** Honest authority state, e.g. "collection authority pending". */
  note: string;
}

export interface RiderJobsResponse {
  jobs: RiderJobView[];
  rider: RiderSelfView | null;
  codCash: RiderCodContext;
}

export interface RiderActionRequest {
  jobId: string;
  /** Demo parity only — production derives the rider from the session. */
  riderId: string;
  action: "accept" | "pickup" | "out" | "deliver" | "fail" | "note";
  /** Proof of delivery when action = "deliver" (engine contract). */
  proofMethod?: "pin" | "signature" | "photo_note";
  proofDetail?: string;
  /** Failure reason when action = "fail" (backend vocabulary is authoritative;
   *  the UI may present friendly choices that map onto it). */
  reason?: string;
  /** Pending note text when action = "note" (queued while offline). */
  note?: string;
}

export interface RiderHistoryRow {
  jobId: string;
  orderReference?: string;
  status: string;
  deliveredAtLabel: string;
  /** COD that was due on delivery — read-only context, collection state
   *  intentionally absent (future COD cash authority). */
  cashToCollectMinor?: number;
  proof?: { method: string; detail: string };
}
