-- Read-only delivery receipt support. This migration cannot send SMS.
-- Delivery evidence is stored separately from the one-time submission state.
ALTER TABLE "SmsDispatch"
  ADD COLUMN "deliveryState" TEXT,
  ADD COLUMN "deliveryCheckedAt" TIMESTAMPTZ(3);

ALTER TABLE "SmsDispatch"
  ADD CONSTRAINT "SmsDispatch_delivery_fields_valid"
    CHECK (
      ("deliveryState" IS NULL AND "deliveryCheckedAt" IS NULL)
      OR
      ("state" = 'submitted'
       AND "providerMessageId" IS NOT NULL
       AND "deliveryState" IN ('delivered', 'sent', 'pending', 'failed', 'unknown')
       AND "deliveryCheckedAt" IS NOT NULL)
    );

-- Preserve immutable source and exactly-one-send semantics while permitting
-- only delivery-status metadata to change on an already submitted SMS.
CREATE OR REPLACE FUNCTION protect_sms_dispatch() RETURNS trigger AS $$
BEGIN
  IF (NEW."id", NEW."notificationId", NEW."recipientPhone",
      NEW."message", NEW."createdAt")
    IS DISTINCT FROM
     (OLD."id", OLD."notificationId", OLD."recipientPhone",
      OLD."message", OLD."createdAt") THEN
    RAISE EXCEPTION 'sms dispatch identity and message are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.state = 'submitted' AND NEW.state = 'submitted' THEN
    IF OLD."providerMessageId" IS NULL OR
       NEW."providerMessageId" IS DISTINCT FROM OLD."providerMessageId" OR
       NEW."attemptedAt" IS DISTINCT FROM OLD."attemptedAt" OR
       NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt" OR
       OLD."deliveryState" IN ('delivered', 'failed') OR
       NEW."deliveryState" NOT IN ('delivered', 'sent', 'pending', 'failed', 'unknown') OR
       NEW."deliveryCheckedAt" IS NULL OR
       (OLD."deliveryCheckedAt" IS NOT NULL AND
        NEW."deliveryCheckedAt" <= OLD."deliveryCheckedAt") THEN
      RAISE EXCEPTION 'sms receipt update denied: source or final evidence is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
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
