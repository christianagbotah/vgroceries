/**
 * A cash-sale POST can commit before a lost network response reaches a cashier.
 * Keep both the first request key and its exact payload until a receipt
 * is confirmed. Changing the customer or cash during recovery would create a
 * different financial instruction and must never happen implicitly.
 *
 * In-memory only: no customer information, payment details or replay key
 * is stored in browser persistence.
 */
export type PosSaleCustomerInput =
  | { mode: "walk_in" }
  | { mode: "existing"; customerUserId: string }
  | { mode: "named"; customerName: string };

export interface LockedPosCashSaleAttempt {
  readonly holdId: string;
  readonly replayKey: string;
  readonly cashReceivedMinor: number;
  readonly handoverNote: string;
  readonly customer: PosSaleCustomerInput;
}

export function lockPosCashSaleAttempt(
  previous: LockedPosCashSaleAttempt | null,
  details: {
    holdId: string;
    cashReceivedMinor: number;
    handoverNote: string;
    customer: PosSaleCustomerInput;
  },
  createReplayKey: () => string = () => crypto.randomUUID(),
): LockedPosCashSaleAttempt {
  if (previous) {
    if (previous.holdId !== details.holdId) {
      throw new Error("A prior counter sale is unresolved. Verify its original till and receipt before starting another.");
    }
    // The cashier must retry the EXACT original request, even if the live
    // text inputs were changed before the network error returned.
    return previous;
  }
  const customer: PosSaleCustomerInput =
    details.customer.mode === "existing"
      ? { mode: "existing", customerUserId: details.customer.customerUserId }
      : details.customer.mode === "named"
        ? { mode: "named", customerName: details.customer.customerName.trim() }
        : { mode: "walk_in" };
  return {
    holdId: details.holdId,
    replayKey: createReplayKey(),
    cashReceivedMinor: details.cashReceivedMinor,
    handoverNote: details.handoverNote.trim(),
    customer,
  };
}
