ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_title_bounded" CHECK (length("title") BETWEEN 1 AND 160),
  ADD CONSTRAINT "Notification_body_bounded" CHECK (length("body") BETWEEN 1 AND 500);

CREATE FUNCTION validate_notification_source() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Order" o
    JOIN "User" u ON u.id = o."customerUserId"
    JOIN "OutboxEvent" e ON e.id = NEW."sourceEventId" AND e."aggregateId" = o.id
    WHERE o.id = NEW."orderId" AND u.id = NEW."recipientUserId"
      AND u.role = 'customer' AND u.active = true
  ) THEN
    RAISE EXCEPTION 'notification recipient must own its source order' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_source_guard BEFORE INSERT ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION validate_notification_source();

CREATE FUNCTION protect_notification_snapshot() RETURNS trigger AS $$
BEGIN
  IF (NEW.id, NEW."recipientUserId", NEW."orderId", NEW."sourceEventId", NEW.kind, NEW.title, NEW.body, NEW."createdAt")
    IS DISTINCT FROM
    (OLD.id, OLD."recipientUserId", OLD."orderId", OLD."sourceEventId", OLD.kind, OLD.title, OLD.body, OLD."createdAt") THEN
    RAISE EXCEPTION 'notification message snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."readAt" IS NOT NULL AND NEW."readAt" IS DISTINCT FROM OLD."readAt" THEN
    RAISE EXCEPTION 'notification first read is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_snapshot_guard BEFORE UPDATE ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION protect_notification_snapshot();

CREATE FUNCTION protect_notification_receipt() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'notification source receipts are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_receipt_guard BEFORE UPDATE OR DELETE ON "NotificationOutboxReceipt"
  FOR EACH ROW EXECUTE FUNCTION protect_notification_receipt();
