/** Guest phone ownership is proven by a consumed, order-scoped OTP, not by
 * possession of an order reference or the supplied checkout number alone. */
export function guestOrderSmsProofWhere(orderId: string, fingerprint: string, recordedAt: Date, now: Date) {
  return {
    userId: orderId, purpose: "sensitive_action", recipientFingerprint: fingerprint,
    status: "consumed", createdAt: { gte: recordedAt, lte: now },
    consumedAt: { gte: recordedAt, lte: now },
  } as const;
}
export function registeredOrderSmsPhoneVerified(
  user: { active: boolean; role: string; phone: string | null; phoneVerifiedAt: Date | null } | null,
  phone: string, now: Date,
): boolean {
  return !!user?.active && user.role === "customer" && user.phone === phone &&
    !!user.phoneVerifiedAt && user.phoneVerifiedAt.getTime() <= now.getTime();
}

/** The creation notification must not ask for payment once already verified. */
export function orderCreatedPaymentInstruction(method: string, status: string): string {
  const electronic = ["electronic", "mobile_money", "card_hosted", "bank_transfer"].includes(method);
  return electronic && ["pending", "unpaid"].includes(status)
    ? " If not already paid, follow the secure payment instructions for your existing order. Do not pay twice." : "";
}
