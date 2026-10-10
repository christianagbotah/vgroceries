/**
 * Shared API contracts — rider workspace (login, today's jobs, lifecycle
 * actions, delivery history). Mobile-first: this is the surface the future
 * React Native rider app will consume. Proposed REST rendering:
 * /api/v1/rider/* (see docs/openapi.yaml).
 */

import type { DeliveryJob } from "@/types/domain";

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
  cashToCollectLabel?: string;
  cashToCollectMinor?: number;
  cashCollectedAt?: string;
  remittedAt?: string;
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

export interface RiderJobsResponse {
  jobs: RiderJobView[];
  rider: RiderSelfView | null;
  remittance: {
    jobs: DeliveryJob[];
    totalMinor: number;
    totalLabel: string;
  };
}

export interface RiderActionRequest {
  jobId: string;
  riderId: string;
  action: "accept" | "pickup" | "out" | "deliver" | "fail" | "note";
  /** Proof of delivery when action = "deliver" (engine contract). */
  proofMethod?: "pin" | "signature" | "photo_note";
  proofDetail?: string;
  /** COD collection flag when action = "deliver". */
  cashCollected?: boolean;
  /** Failure reason when action = "fail". */
  reason?: string;
  /** Pending note text when action = "note" (queued while offline). */
  note?: string;
}

export interface RiderHistoryRow {
  jobId: string;
  orderReference?: string;
  status: string;
  deliveredAtLabel: string;
  cashToCollectMinor?: number;
  cashCollected: boolean;
  remitted: boolean;
  proof?: { method: string; detail: string };
}
