-- R2b: independent, default-off non-food return eligibility review and
-- atomic movement from original quarantine custody to a new regular lot.
-- This is NOT a payment/refund approval and NOT blanket grocery-food resale.
CREATE TABLE "PhysicalReturnResaleReview" (
  "itemId" TEXT NOT NULL REFERENCES "PhysicalReturnItem"(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  "evidenceNote" TEXT NOT NULL,
  "safetyClassification" TEXT NOT NULL,
  "factorySealIntact" BOOLEAN NOT NULL,
  "tamperAndContaminationAbsent" BOOLEAN NOT NULL,
  "sourceTraceabilityVerified" BOOLEAN NOT NULL,
  "expiryAndStorageVerified" BOOLEAN NOT NULL,
  "proposedBy" TEXT NOT NULL,
  "proposedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMPTZ(3),
  "decisionNote" TEXT,
  "saleableLotId" TEXT UNIQUE REFERENCES "StockLot"(id) ON DELETE RESTRICT,
  "transferReceiptId" TEXT REFERENCES "StockReceipt"(id) ON DELETE RESTRICT,
  CONSTRAINT "PhysicalReturnResaleReview_pkey" PRIMARY KEY ("itemId"),
  CONSTRAINT "PhysicalReturnResaleReview_status" CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT "PhysicalReturnResaleReview_evidence" CHECK (length(btrim("evidenceNote")) BETWEEN 30 AND 1500),
  CONSTRAINT "PhysicalReturnResaleReview_safety" CHECK (
    "safetyClassification"='non_food_factory_sealed'
    AND "factorySealIntact"=true AND "tamperAndContaminationAbsent"=true
    AND "sourceTraceabilityVerified"=true AND "expiryAndStorageVerified"=true
  ),
  CONSTRAINT "PhysicalReturnResaleReview_decision_note" CHECK ("decisionNote" IS NULL OR length(btrim("decisionNote")) BETWEEN 20 AND 1000),
  CONSTRAINT "PhysicalReturnResaleReview_state" CHECK (
    (status='pending' AND "decidedBy" IS NULL AND "decidedAt" IS NULL
      AND "decisionNote" IS NULL AND "saleableLotId" IS NULL AND "transferReceiptId" IS NULL)
    OR
    (status='rejected' AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL
      AND "decisionNote" IS NOT NULL AND "saleableLotId" IS NULL AND "transferReceiptId" IS NULL)
    OR
    (status='approved' AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL
      AND "decisionNote" IS NOT NULL AND "saleableLotId" IS NOT NULL AND "transferReceiptId" IS NOT NULL)
  )
);
CREATE INDEX "PhysicalReturnResaleReview_status_proposedAt_idx"
  ON "PhysicalReturnResaleReview"(status,"proposedAt");

-- Restrict the review origin to fully inspected physical goods with original
-- immutable quarantine custody. Only sealed PACKAGED units can be proposed.
CREATE FUNCTION guard_physical_return_resale_review() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'resale safety review is immutable evidence' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' OR NOT EXISTS(
      SELECT 1 FROM "PhysicalReturnItem" item
      JOIN "PhysicalReturnReceipt" r ON r.id=item."receiptId"
      JOIN "PhysicalReturnCustody" c ON c."itemId"=item.id
      JOIN "OrderLine" o ON o.id=item."orderLineId"
      JOIN "Variant" v ON v.id=item."variantId"
      JOIN "Product" p ON p.id=v."productId"
      JOIN "Category" cat ON cat.id=p."categoryId"
      JOIN "StockLot" source ON source.id=c."sourceLotId"
      WHERE item.id=NEW."itemId"
        AND item.condition='sealed' AND item.disposition='quarantine'
        AND item."inspectedAt" IS NOT NULL AND r.status='inspected'
        AND c.quantity=item.quantity AND o.unit='piece'
        AND v.active AND p.published
        AND cat.slug IN ('non-food','household','household-essentials','cleaning-supplies')
        AND source."expiryDate" IS NOT NULL
        AND source."expiryDate" >= ((now() AT TIME ZONE 'Africa/Accra')::date + 30)
    ) THEN
      RAISE EXCEPTION 'resale review requires safely classified, sealed, traced non-food goods with minimum shelf life'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected')
    OR NEW."itemId"<>OLD."itemId"
    OR NEW."evidenceNote"<>OLD."evidenceNote"
    OR NEW."safetyClassification"<>OLD."safetyClassification"
    OR NEW."factorySealIntact"<>OLD."factorySealIntact"
    OR NEW."tamperAndContaminationAbsent"<>OLD."tamperAndContaminationAbsent"
    OR NEW."sourceTraceabilityVerified"<>OLD."sourceTraceabilityVerified"
    OR NEW."expiryAndStorageVerified"<>OLD."expiryAndStorageVerified"
    OR NEW."proposedBy"<>OLD."proposedBy"
    OR NEW."proposedAt"<>OLD."proposedAt"
    OR NEW."decidedBy"=OLD."proposedBy" THEN
    RAISE EXCEPTION 'only an independent final resale reviewer may decide once'
      USING ERRCODE='23514';
  END IF;
  IF NEW.status='approved' AND NOT EXISTS(
      SELECT 1 FROM "PhysicalReturnItem" item
      JOIN "PhysicalReturnReceipt" r ON r.id=item."receiptId"
      JOIN "PhysicalReturnCustody" c ON c."itemId"=item.id
      JOIN "StockLot" q ON q.id=c."quarantineLotId"
      JOIN "StockLot" source ON source.id=c."sourceLotId"
      WHERE item.id=NEW."itemId" AND item."inspectedBy"<>NEW."decidedBy"
      AND r."receivedBy"<>NEW."decidedBy" AND c."recordedBy"<>NEW."decidedBy"
      AND source."expiryDate" IS NOT NULL
      AND source."expiryDate" >= ((now() AT TIME ZONE 'Africa/Accra')::date + 30)
      AND q.quantity=c.quantity AND q.quarantined=true
      AND q.kind='physical_return_quarantine'
  ) THEN
    RAISE EXCEPTION 'resale approval requires independent staff and current quarantined stock'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER physical_return_resale_review_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "PhysicalReturnResaleReview"
  FOR EACH ROW EXECUTE FUNCTION guard_physical_return_resale_review();

-- Extend R2a immutable quarantine lot guard with exactly one permitted
-- full-quantity, approved stock transfer. The lot remains quarantined forever;
-- only its current physical quantity becomes zero. No direct saleable flip.
CREATE OR REPLACE FUNCTION prevent_quarantined_return_lot_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.kind='physical_return_quarantine' THEN
    RAISE EXCEPTION 'returned quarantine lot cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.kind='physical_return_quarantine' THEN
    IF NEW.id=OLD.id AND NEW."positionId"=OLD."positionId"
      AND NEW."receiptId" IS NOT DISTINCT FROM OLD."receiptId"
      AND NEW."lotNumber"=OLD."lotNumber"
      AND NEW."expiryDate" IS NOT DISTINCT FROM OLD."expiryDate"
      AND NEW."unitCostMinor" IS NOT DISTINCT FROM OLD."unitCostMinor"
      AND NEW."createdAt"=OLD."createdAt"
      AND NEW.kind='physical_return_quarantine' AND NEW.quarantined=true
      AND NEW.quantity=0 AND OLD.quantity>0
      AND EXISTS(
        SELECT 1 FROM "PhysicalReturnCustody" c
        JOIN "PhysicalReturnResaleReview" review ON review."itemId"=c."itemId"
        WHERE c."quarantineLotId"=OLD.id AND review.status='approved'
          AND review."saleableLotId" IS NOT NULL
          AND c.quantity=OLD.quantity
      ) THEN RETURN NEW;
    END IF;
    RAISE EXCEPTION 'returned quarantine lots may only be depleted once by approved resale transfer'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Preserve the original admission movement, permit one exact matching
-- negative movement only with independent approval and zero remaining stock.
CREATE OR REPLACE FUNCTION verify_return_quarantine_movement() RETURNS trigger AS $$
DECLARE lot "StockLot"%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT * INTO lot FROM "StockLot" WHERE id=NEW."lotId";
    IF lot.kind='physical_return_quarantine' THEN
      IF NEW.reason='physical_return_quarantine'
        AND NEW."receiptId" IS NOT DISTINCT FROM lot."receiptId"
        AND NEW."resultingQty"=NEW.delta AND NEW.delta>0
        AND NOT EXISTS(SELECT 1 FROM "StockMovement" prior WHERE prior."lotId"=lot.id)
      THEN RETURN NEW; END IF;
      IF NEW.reason='physical_return_resale_transfer_out'
        AND NEW.delta<0 AND NEW."resultingQty"=0 AND lot.quantity=0
        AND NOT EXISTS(SELECT 1 FROM "StockMovement" prior
          WHERE prior."lotId"=lot.id AND prior.delta<0)
        AND EXISTS(
          SELECT 1 FROM "PhysicalReturnCustody" c
          JOIN "PhysicalReturnResaleReview" review ON review."itemId"=c."itemId"
          WHERE c."quarantineLotId"=lot.id
            AND review.status='approved' AND review."transferReceiptId"=NEW."receiptId"
            AND review."decidedBy"=NEW."actorId" AND NEW.delta=-c.quantity
        )
      THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'quarantined goods require one immutable admission and one approved transfer'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM "StockLot" l WHERE l.id=OLD."lotId"
    AND l.kind='physical_return_quarantine') THEN
    RAISE EXCEPTION 'return quarantine movement history is immutable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Before an approved review can COMMIT, require an exactly balanced physical
-- transfer and a new saleable lot with matching variant, expiry, qty and costs.
CREATE FUNCTION validate_approved_return_stock_transfer() RETURNS trigger AS $$
BEGIN
  IF NEW.status='approved' AND NOT EXISTS(
    SELECT 1 FROM "PhysicalReturnCustody" c
    JOIN "StockLot" q ON q.id=c."quarantineLotId"
    JOIN "StockLot" source ON source.id=c."sourceLotId"
    JOIN "StockLot" saleable ON saleable.id=NEW."saleableLotId"
    JOIN "StockReceipt" receipt ON receipt.id=NEW."transferReceiptId"
    WHERE c."itemId"=NEW."itemId"
      AND q.quantity=0 AND q.kind='physical_return_quarantine'
      AND q.quarantined=true
      AND saleable.kind='regular' AND saleable.quarantined=false
      AND saleable.quantity=c.quantity
      AND saleable."positionId"=q."positionId"
      AND saleable."receiptId"=receipt.id
      AND saleable."expiryDate" IS NOT DISTINCT FROM source."expiryDate"
      AND saleable."unitCostMinor" IS NOT DISTINCT FROM source."unitCostMinor"
      AND source."expiryDate" >= ((now() AT TIME ZONE 'Africa/Accra')::date + 30)
      AND (SELECT count(*) FROM "StockMovement" m WHERE m."lotId"=q.id
        AND m.reason='physical_return_resale_transfer_out'
        AND m.delta=-c.quantity AND m."resultingQty"=0
        AND m."receiptId"=receipt.id AND m."actorId"=NEW."decidedBy")=1
      AND (SELECT count(*) FROM "StockMovement" m WHERE m."lotId"=saleable.id
        AND m.reason='physical_return_resale_transfer_in'
        AND m.delta=c.quantity AND m."resultingQty"=c.quantity
        AND m."receiptId"=receipt.id AND m."actorId"=NEW."decidedBy")=1
  ) THEN
    RAISE EXCEPTION 'approved physical resale requires exactly balanced stock transfer'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER physical_return_resale_atomic
  AFTER UPDATE ON "PhysicalReturnResaleReview"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_approved_return_stock_transfer();

-- Only rows produced by the approved return transfer may enter the new
-- regular-lot prefix. The held stock original cannot be duplicated by release.
CREATE FUNCTION verify_resale_regular_lot_at_commit() RETURNS trigger AS $$
BEGIN
  IF NEW."lotNumber" LIKE 'RET-RESALE-%' AND NOT EXISTS(
    SELECT 1 FROM "PhysicalReturnResaleReview" r
    WHERE r."saleableLotId"=NEW.id AND r.status='approved'
  ) THEN
    RAISE EXCEPTION 'unlinked saleable returned-goods lot' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER physical_return_resale_lot_proof
  AFTER INSERT ON "StockLot" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_resale_regular_lot_at_commit();
