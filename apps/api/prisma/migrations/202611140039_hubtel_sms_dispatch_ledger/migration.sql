-- Optional transactional SMS dispatch ledger. No external sending occurs
-- by applying this migration; the separate CLI worker is disabled by default.
CREATE TABLE "SmsDispatch" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'queued',
  "providerMessageId" TEXT,
  "attemptedAt" TIMESTAMPTZ(3),
  "resolvedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsDispatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SmsDispatch_state_valid"
    CHECK ("state" IN ('queued', 'attempting', 'submitted', 'uncertain')),
  CONSTRAINT "SmsDispatch_phone_valid"
    CHECK ("recipientPhone" ~ '^\\+233[0-9]{9}$'),
  CONSTRAINT "SmsDispatch_message_valid"
    CHECK (length("message") BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX "SmsDispatch_notificationId_key"
  ON "SmsDispatch"("notificationId");
CREATE INDEX "SmsDispatch_state_createdAt_id_idx"
  ON "SmsDispatch"("state", "createdAt", "id");
ALTER TABLE "SmsDispatch" ADD CONSTRAINT "SmsDispatch_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the immutable source/recipient/body and enforce at-most-one
-- submission. A stale 'attempting' row is deliberately NOT retried: an
-- HTTP timeout could mean Hubtel accepted and charged for the SMS.
CREATE FUNCTION protect_sms_dispatch() RETURNS trigger AS $$
BEGIN
  IF (NEW."id", NEW."notificationId", NEW."recipientPhone",
      NEW."message", NEW."createdAt")
    IS DISTINCT FROM
     (OLD."id", OLD."notificationId", OLD."recipientPhone",
      OLD."message", OLD."createdAt") THEN
    RAISE EXCEPTION 'sms dispatch identity and message are immutable'
      USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD.state = 'queued' AND NEW.state = 'attempting') OR
    (OLD.state = 'attempting' AND NEW.state IN ('submitted', 'uncertain'))
  ) THEN
    RAISE EXCEPTION 'sms dispatch transition denied: manual review required'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'queued'
    AND (NEW."attemptedAt" IS NULL OR NEW."resolvedAt" IS NOT NULL
      OR NEW."providerMessageId" IS NOT NULL) THEN
    RAISE EXCEPTION 'sms attempt must be timestamped without provider outcome'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.state IN ('submitted', 'uncertain')
    AND (NEW."resolvedAt" IS NULL OR OLD."attemptedAt" IS NULL) THEN
    RAISE EXCEPTION 'sms result requires prior attempt and resolution time'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sms_dispatch_guard BEFORE UPDATE ON "SmsDispatch"
  FOR EACH ROW EXECUTE FUNCTION protect_sms_dispatch();
