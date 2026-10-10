/**
 * Shared API contracts — dispatch, delivery providers, rider fleet (staff).
 * Proposed REST rendering: /api/v1/dispatch/* (see docs/openapi.yaml).
 */

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
  codAmountMinor: number;
  lineCount: number;
}

export interface DispatchJobRow {
  id: string;
  orderId: string;
  orderReference?: string;
  customerName?: string;
  status: string;
  riderName?: string;
  providerName?: string;
  zone?: string;
  failureReason?: string;
  rescheduledFor?: string;
  cashToCollectLabel?: string;
  cashCollectedAt?: string;
  remittedAt?: string;
  proof?: { method: string; detail: string; at: string };
  instructions?: string;
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
  pendingRemittanceMinor: number;
  pendingRemittanceLabel: string;
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
  action: "reschedule" | "return_to_store" | "remit";
  when?: string;
  note?: string;
  riderId?: string;
  amountMinor?: number;
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
  lastLocationAt?: string;
  lastLocationLabel?: string;
  isDemo: boolean;
  pendingRemittanceLabel: string;
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
