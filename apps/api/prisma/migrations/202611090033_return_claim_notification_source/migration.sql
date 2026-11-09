-- Maintain the order-owner check for original events and allow only four
-- return-claim status events with a verified claim -> order -> customer chain.
-- Outbox payloads are never trusted for recipient identity.
CREATE OR REPLACE FUNCTION validate_notification_source() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Order" o
    JOIN "User" u ON u.id = o."customerUserId"
    JOIN "OutboxEvent" e ON e.id = NEW."sourceEventId"
    LEFT JOIN "CustomerReturnClaim" c
      ON e.type IN (
        'customer_return_claim.requested',
        'customer_return_claim.accepted',
        'customer_return_claim.rejected',
        'customer_return_claim.cancelled'
      )
      AND c.id = e."aggregateId"
      AND c."orderId" = o.id
      AND c."customerUserId" = u.id
    WHERE o.id = NEW."orderId"
      AND u.id = NEW."recipientUserId"
      AND u.role = 'customer'
      AND u.active = true
      AND (
        (e.type NOT LIKE 'customer_return_claim.%' AND e."aggregateId" = o.id)
        OR (e.type IN (
          'customer_return_claim.requested',
          'customer_return_claim.accepted',
          'customer_return_claim.rejected',
          'customer_return_claim.cancelled'
        ) AND c.id IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION 'notification recipient must own its source order'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
