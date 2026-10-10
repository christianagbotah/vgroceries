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
  lines: AllocationLineInput[];
}

export interface AllocationLotResult {
  reservationId: string;
  claimLineId: string;
  variantId: string;
  lotId: string;
  quantity: string;
  expiryDate: string | null;
}
