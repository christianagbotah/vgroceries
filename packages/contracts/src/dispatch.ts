/**
 * Shared API contracts — dispatch, delivery providers, rider fleet (staff).
 * Proposed REST rendering: /api/v1/dispatch/* (see docs/openapi.yaml).
 *
 * Domain alignment (Fulfilment + Stock Handover Authority #12):
 * - Dispatch begins AFTER the authoritative fulfilment handover: every order
 *   in the ready queue has fulfilmentStatus = "dispatched", physical stock
 *   already consumed exactly once (Order.stockConsumedAt set).
 * - Assignment / reassignment / unassign / rider lifecycle actions never
 *   mutate stock. Delivery completion never mutates payment status.
 * - COD amounts are read-only operational context ("collection authority
 *   pending"); cash collection and rider remittance belong to a future COD
 *   cash authority and are intentionally NOT modelled here.
 * - `allowedActions` / `blockers` are server-derived when the production
 *   dispatch authority lands; the mock adapter mirrors them deterministically
 *   for demo/test parity only.
 */

export type DispatchJobAllowedAction =
  | "assign"
  | "unassign"
  | "reassign"
  | "reschedule"
  | "return_to_store";

/** Order handed over to dispatch custody, waiting for assignment. */
export interface DispatchReadyRow {
  id: string;
  reference: string;
  customerName: string;
  customerPhone: string;
  zone?: string;
  zoneId?: string;
  slotLabel?: string;
  totalLabel: string;
  paymentMethod: string;
  paymentStatus: string;
  /** COD due on delivery — read-only context; collection authority pending. */
  codAmountMinor: number;
  lineCount: number;
  /** When the fulfilment authority handed stock over to dispatch custody. */
  handedOverAt?: string;
  /** When physical stock was consumed (exactly once, at handover). */
  stockConsumedAt?: string;
  /** Backend-derived blockers; when present the order is not assignable. */
  blockers?: string[];
  /** Backend-derived actions permitted on this row. */
  allowedActions?: DispatchJobAllowedAction[];
}

export interface DispatchJobRow {
  id: string;
  orderId: string;
  orderReference?: string;
  customerName?: string;
  status: string;
  riderId?: string;
  riderName?: string;
  providerName?: string;
  zone?: string;
  failureReason?: string;
  rescheduledFor?: string;
  /** COD due on delivery — read-only context; collection authority pending. */
  cashToCollectLabel?: string;
  proof?: { method: string; detail: string; at: string };
  instructions?: string;
  /** Backend-derived blockers for the next action. */
  blockers?: string[];
  /** Backend-derived actions permitted on this job. */
  allowedActions?: DispatchJobAllowedAction[];
  events: { atLabel: string; actor: string; action: string; note?: string }[];
}

export interface DispatchRiderRow {
  id: string;
  name: string;
  phone: string;
  kind: string;
  vehicle: string;
  isAvailable: boolean;
  activeJobId?: string;
  zones: string[];
  /** Why an unavailable rider cannot take a job (busy on delivery / off duty). */
  unavailableReason?: string;
  /** Completed delivery count (real data only). */
  completedJobs?: number;
}

export interface DispatchProviderRow {
  id: string;
  name: string;
  capabilities: string[];
  status: string;
  notes: string;
}

export interface DispatchQueueResponse {
  ready: DispatchReadyRow[];
  jobs: DispatchJobRow[];
  riders: DispatchRiderRow[];
  providers: DispatchProviderRow[];
}

export interface DispatchAssignRequest {
  orderId: string;
  /** Exactly one target: in-house rider, external provider, or manual. */
  riderId?: string;
  providerId?: string;
  manual?: boolean;
  actor?: string;
}

export interface DispatchAssignResponse {
  jobId: string;
  status: string;
}

export interface DispatchJobActionRequest {
  jobId: string;
  action: "unassign" | "reschedule" | "return_to_store" | "reassign";
  when?: string;
  note?: string;
  riderId?: string;
  actor?: string;
}

export interface DispatchJobActionResponse {
  done: boolean;
}

export interface AdminRiderRow {
  id: string;
  name: string;
  phone: string;
  kind: string;
  vehicle: string;
  zoneNames: string;
  isAvailable: boolean;
  activeJobId?: string;
  /** Reference of the active job (real data only, for a deep link). */
  activeJobReference?: string;
  lastLocationAt?: string;
  lastLocationLabel?: string;
  isDemo: boolean;
  completedJobs: number;
}

export interface RiderToggleRequest {
  riderId: string;
  available: boolean;
  actor?: string;
}

export interface RiderToggleResponse {
  isAvailable: boolean;
}

/** Provider registry row (staff dispatch screen). */
export interface ProviderRow {
  id: string;
  name: string;
  capabilities: string[];
  status: string;
  notes: string;
  capabilitiesNote: string;
  isConfigured: boolean;
}
