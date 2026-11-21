/** Explicit evidence gate; a global channel switch is not customer consent. */
export function canStageCustomerDelivery(input: {
  eventCreatedAt: Date;
  consentRecordedAt: Date | null | undefined;
  consentRevokedAt?: Date | null;
  channelEnabled: boolean;
  /** Dispatch-time evaluation prevents queued messages from ignoring later opt-outs. */
  evaluatedAt?: Date;
}): boolean {
  const { eventCreatedAt, consentRecordedAt, consentRevokedAt, channelEnabled, evaluatedAt } = input;
  if (!channelEnabled || !consentRecordedAt) return false;
  const eventTime = eventCreatedAt.getTime();
  const consentTime = consentRecordedAt.getTime();
  if (!Number.isFinite(eventTime) || !Number.isFinite(consentTime) || consentTime > eventTime) return false;
  const evaluationTime = evaluatedAt?.getTime() ?? eventTime;
  if (!Number.isFinite(evaluationTime) || evaluationTime < eventTime) return false;
  if (consentRevokedAt) {
    const revokedTime = consentRevokedAt.getTime();
    if (!Number.isFinite(revokedTime) || revokedTime <= evaluationTime) return false;
  }
  return true;
}
