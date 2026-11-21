/** Explicit evidence gate; a global channel switch is not customer consent. */
export function canStageCustomerDelivery(input: {
  eventCreatedAt: Date;
  consentRecordedAt: Date | null | undefined;
  consentRevokedAt?: Date | null;
  channelEnabled: boolean;
}): boolean {
  const { eventCreatedAt, consentRecordedAt, consentRevokedAt, channelEnabled } = input;
  if (!channelEnabled || !consentRecordedAt) return false;
  const eventTime = eventCreatedAt.getTime();
  const consentTime = consentRecordedAt.getTime();
  if (!Number.isFinite(eventTime) || !Number.isFinite(consentTime) || consentTime > eventTime) return false;
  if (consentRevokedAt) {
    const revokedTime = consentRevokedAt.getTime();
    if (!Number.isFinite(revokedTime) || revokedTime <= eventTime) return false;
  }
  return true;
}
