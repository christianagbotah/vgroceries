-- R3a: requests only; never a physical stock receipt, stock claim, refund
-- obligation or payment event. All authority remains OFF by default.
CREATE TABLE "CustomerReturnClaim"(
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  "orderId" TEXT NOT NULL REFERENCES "Order"(id) ON DELETE RESTRICT,
  "customerUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'requested',
  reason TEXT NOT NULL,
  "evidenceNote" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewedBy" TEXT,
  "reviewNote" TEXT,
  "cancelledAt" TIMESTAMPTZ(3),
  CONSTRAINT claim_status CHECK (status IN ('requested','accepted','rejected','cancelled')),
  CONSTRAINT claim_reason CHECK (char_length(btrim(reason)) BETWEEN 10 AND 600),
  CONSTRAINT claim_evidence CHECK ("evidenceNote" IS NULL OR char_length(btrim("evidenceNote")) BETWEEN 10 AND 1500),
  CONSTRAINT claim_state CHECK (
    (status='requested' AND "reviewedAt" IS NULL AND "reviewedBy" IS NULL
      AND "reviewNote" IS NULL AND "cancelledAt" IS NULL)
    OR (status IN ('accepted','rejected') AND "reviewedAt" IS NOT NULL
      AND "reviewedBy" IS NOT NULL AND "reviewNote" IS NOT NULL AND "cancelledAt" IS NULL)
    OR (status='cancelled' AND "cancelledAt" IS NOT NULL
      AND "reviewedAt" IS NULL AND "reviewedBy" IS NULL AND "reviewNote" IS NULL)
  )
);
CREATE INDEX customer_claim_customer_date ON "CustomerReturnClaim"("customerUserId","createdAt");
CREATE INDEX customer_claim_order_status ON "CustomerReturnClaim"("orderId",status);
CREATE INDEX customer_claim_status_date ON "CustomerReturnClaim"(status,"createdAt");

CREATE TABLE "CustomerReturnClaimLine"(
  "claimId" TEXT NOT NULL REFERENCES "CustomerReturnClaim"(id) ON DELETE RESTRICT,
  "orderLineId" TEXT NOT NULL REFERENCES "OrderLine"(id) ON DELETE RESTRICT,
  quantity DECIMAL(15,3) NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY("claimId","orderLineId"),
  CONSTRAINT return_claim_line_quantity CHECK (quantity>0),
  CONSTRAINT return_claim_line_reason CHECK (char_length(btrim(reason)) BETWEEN 10 AND 400)
);
CREATE INDEX customer_return_claim_line_original ON "CustomerReturnClaimLine"("orderLineId");

-- The original order row serializes all claim submissions across API instances
-- AND direct SQL writers, closing the simultaneous overclaim race.
CREATE FUNCTION validate_customer_claim_state() RETURNS trigger AS $$
DECLARE ord RECORD;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'customer return claims cannot be deleted'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT id,"customerUserId","fulfilmentStatus","stockConsumedAt" INTO ord
      FROM "Order" WHERE id=NEW."orderId" FOR UPDATE;
    IF NOT FOUND OR ord."customerUserId" IS DISTINCT FROM NEW."customerUserId"
      OR ord."stockConsumedAt" IS NULL
      OR ord."fulfilmentStatus" NOT IN ('delivered','collected')
      OR NEW.status<>'requested' THEN
      RAISE EXCEPTION 'claim requires completed stock-depleted order owned by the customer'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'requested'
    OR NEW.id<>OLD.id OR NEW.reference<>OLD.reference
    OR NEW."orderId"<>OLD."orderId"
    OR NEW."customerUserId"<>OLD."customerUserId"
    OR NEW.reason<>OLD.reason
    OR NEW."evidenceNote" IS DISTINCT FROM OLD."evidenceNote"
    OR NEW."createdAt"<>OLD."createdAt"
    OR NEW.status NOT IN ('accepted','rejected','cancelled') THEN
    RAISE EXCEPTION 'customer return history is terminal and immutable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER customer_return_claim_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON "CustomerReturnClaim"
  FOR EACH ROW EXECUTE FUNCTION validate_customer_claim_state();

CREATE FUNCTION validate_customer_claim_line() RETURNS trigger AS $$
DECLARE claim_record RECORD;
DECLARE source_record RECORD;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'customer return lines are immutable'
      USING ERRCODE='23514';
  END IF;
  SELECT "orderId",status INTO claim_record FROM "CustomerReturnClaim"
    WHERE id=NEW."claimId";
  IF NOT FOUND OR claim_record.status<>'requested' THEN
    RAISE EXCEPTION 'return claim is not open for receiving lines'
      USING ERRCODE='23514';
  END IF;
  SELECT ol.id,ol.quantity,ol.unit INTO source_record FROM "OrderLine" ol
    WHERE ol.id=NEW."orderLineId" AND ol."orderId"=claim_record."orderId";
  IF NOT FOUND OR NEW.quantity>source_record.quantity
    OR (source_record.unit NOT IN ('kg','litre') AND NEW.quantity<>trunc(NEW.quantity)) THEN
    RAISE EXCEPTION 'returned line does not belong to order or has invalid units'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER customer_claim_line_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON "CustomerReturnClaimLine"
  FOR EACH ROW EXECUTE FUNCTION validate_customer_claim_line();

-- At COMMIT require a nonempty claim and cap ALL active claims plus actual
-- staff physical return receipts by the original stock-depleted quantity.
-- Rejected/cancelled requests release their reservations for future requests.
-- Direct SQL cannot forge a claim with no lines or more units than were sold.
CREATE FUNCTION verify_customer_claim_aggregate() RETURNS trigger AS $$
DECLARE exceeded BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "CustomerReturnClaimLine" WHERE "claimId"=NEW.id) THEN
    RAISE EXCEPTION 'customer claim requires at least one order line'
      USING ERRCODE='23514';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM "CustomerReturnClaimLine" line
    JOIN "OrderLine" original ON original.id=line."orderLineId"
    JOIN "CustomerReturnClaim" claim ON claim.id=line."claimId"
    WHERE claim.id=NEW.id AND (
      (SELECT COALESCE(sum(other_line.quantity),0)
         FROM "CustomerReturnClaimLine" other_line
         JOIN "CustomerReturnClaim" other_claim ON other_claim.id=other_line."claimId"
        WHERE other_claim."orderId"=claim."orderId"
          AND other_line."orderLineId"=line."orderLineId"
          AND other_claim.status IN ('requested','accepted'))
      +
      (SELECT COALESCE(sum(item.quantity),0)
         FROM "PhysicalReturnItem" item
         JOIN "PhysicalReturnReceipt" receipt ON receipt.id=item."receiptId"
        WHERE receipt."orderId"=claim."orderId"
          AND item."orderLineId"=line."orderLineId")
      >
      (SELECT COALESCE(sum(depleted.quantity),0)
        FROM "StockDepletion" dep
        JOIN "StockDepletionLine" depleted ON depleted."depletionId"=dep.id
       WHERE dep."claimType"='order' AND dep."claimId"=claim."orderId"
         AND depleted."claimLineId"=line."orderLineId")
    )
  ) INTO exceeded;
  IF exceeded THEN
    RAISE EXCEPTION 'return claims plus physically returned goods exceed original stock-depleted quantity'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER customer_claim_quantity_at_commit
  AFTER INSERT ON "CustomerReturnClaim" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_customer_claim_aggregate();

-- Prevent adding lines to existing committed claims, including forged SQL.
-- Claim and line writes must originate in one database transaction.
CREATE FUNCTION ensure_customer_claim_line_same_transaction() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "CustomerReturnClaim" claim
    WHERE claim.id=NEW."claimId"
      AND claim.xmin::text=txid_current()::text
  ) THEN
    RAISE EXCEPTION 'return lines may only be recorded with original claim creation'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER customer_claim_line_same_transaction
  BEFORE INSERT ON "CustomerReturnClaimLine"
  FOR EACH ROW EXECUTE FUNCTION ensure_customer_claim_line_same_transaction();
