export interface AllocationLineInput {
  claimLineId: string;
  variantId: string;
  quantity: string;
}

export interface CreateAllocationInput {
  claimType: "order" | "pos_draft";
  claimId: string;
  locationId: string;
  expiresAt: Date;
  actorId: string;
  requestId: string;
  lines: AllocationLineInput[];
}

export interface AllocationOperationContext {
  actorId: string;
  requestId: string;
}

export interface AllocationLotResult {
  reservationId: string;
  claimLineId: string;
  variantId: string;
  lotId: string;
  quantity: string;
  expiryDate: string | null;
}
