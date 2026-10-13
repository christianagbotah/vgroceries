import type { Prisma } from "@prisma/client";

export interface ClaimExpectedLine {
  claimLineId: string;
  variantId: string;
  quantity: string;
}

export interface LockExactClaimInput {
  claimType: string;
  claimId: string;
  locationId: string;
  lines: ClaimExpectedLine[];
}

export interface LockedClaimReservation {
  id: string;
  positionId: string;
  lotId: string;
  claimLineId: string;
  generation: number;
  quantity: Prisma.Decimal;
  expiresAt: Date;
  variantId: string;
  locationId: string;
  unit: string;
}

export interface LockedClaimCoverage {
  generation: number;
  reservations: LockedClaimReservation[];
}

export type StockDepletionKind =
  | "dispatch_handover"
  | "collection_handover"
  | "pos_handover";

export interface ConsumeClaimInput extends LockExactClaimInput {
  kind: StockDepletionKind;
  actorId: string;
  requestId: string;
}

export interface StockDepletionLineResult {
  reservationId: string;
  claimLineId: string;
  variantId: string;
  lotId: string;
  quantity: string;
  lotQuantityBefore: string;
  lotQuantityAfter: string;
}

export interface ConsumeClaimResult {
  depletionId: string;
  createdAt: Date;
  lines: StockDepletionLineResult[];
  replayed: boolean;
}
