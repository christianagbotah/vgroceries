-- P0c1 CASH-ONLY handover. Server owned sale identity, append-only cash
-- attestation, source hold and exactly-once StockDepletion. No electronic
-- payment truth, tax invoice or refunds are created here. Feature OFF.
ALTER TABLE "PosStockHold" DROP CONSTRAINT pos_hold_state;
ALTER TABLE "PosStockHold" ADD CONSTRAINT pos_hold_state
  CHECK (status IN ('held','released','expired','consumed'));
ALTER TABLE "PosStockHold" DROP CONSTRAINT pos_hold_release_shape;
ALTER TABLE "PosStockHold" ADD CONSTRAINT pos_hold_release_shape CHECK (
  (status IN ('held','consumed') AND "releasedAt" IS NULL AND "releaseNote" IS NULL)
  OR (status IN ('released','expired') AND "releasedAt" IS NOT NULL
      AND "releaseNote" IS NOT NULL
      AND char_length(btrim("releaseNote")) BETWEEN 10 AND 400)
);

CREATE TABLE "PosCashSale" (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  "holdId" TEXT NOT NULL UNIQUE REFERENCES "PosStockHold"(id) ON DELETE RESTRICT,
  "tillSessionId" TEXT NOT NULL REFERENCES "CashierTillSession"(id) ON DELETE RESTRICT,
  "locationId" TEXT NOT NULL REFERENCES "Location"(id) ON DELETE RESTRICT,
  "soldByUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "stockDepletionId" TEXT NOT NULL UNIQUE REFERENCES "StockDepletion"(id) ON DELETE RESTRICT,
  "subtotalMinor" INTEGER NOT NULL,
  "cashReceivedMinor" INTEGER NOT NULL,
  "changeGivenMinor" INTEGER NOT NULL,
  "handoverNote" TEXT NOT NULL,
  "cashCountConfirmed" BOOLEAN NOT NULL,
  "goodsHandedOver" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT pos_cash_amounts CHECK (
    "subtotalMinor" BETWEEN 1 AND 100000000
    AND "cashReceivedMinor" BETWEEN "subtotalMinor" AND 100000000
    AND "changeGivenMinor" BETWEEN 0 AND 100000000
    AND "changeGivenMinor"="cashReceivedMinor"-"subtotalMinor"),
  CONSTRAINT pos_cash_attest CHECK ("cashCountConfirmed" AND "goodsHandedOver"),
  CONSTRAINT pos_cash_note CHECK (char_length(btrim("handoverNote")) BETWEEN 10 AND 400),
  CONSTRAINT pos_cash_reference CHECK (reference ~ '^VG-POS-[A-Z0-9]{12}$')
);
CREATE INDEX pos_cash_by_till ON "PosCashSale"("tillSessionId","createdAt");
CREATE INDEX pos_cash_by_location ON "PosCashSale"("locationId","createdAt");

CREATE OR REPLACE FUNCTION verify_pos_cash_sale() RETURNS trigger AS $$
DECLARE source_hold "PosStockHold"%ROWTYPE;
DECLARE source_till "CashierTillSession"%ROWTYPE;
DECLARE source_depletion "StockDepletion"%ROWTYPE;
DECLARE drawer_balance BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'POS cash sales are immutable; use audited refund authority'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO source_till FROM "CashierTillSession"
    WHERE id=NEW."tillSessionId" FOR UPDATE;
  SELECT * INTO source_hold FROM "PosStockHold"
    WHERE id=NEW."holdId" FOR UPDATE;
  SELECT * INTO source_depletion FROM "StockDepletion"
    WHERE id=NEW."stockDepletionId";
  IF source_till.id IS NULL OR source_till.status<>'open'
    OR source_hold.id IS NULL OR source_hold.status<>'held'
    OR source_hold."expiresAt"<=now()
    OR source_hold."tillSessionId"<>source_till.id
    OR source_hold."locationId"<>NEW."locationId"
    OR source_till."locationId"<>NEW."locationId"
    OR source_hold."subtotalMinor"<>NEW."subtotalMinor"
    OR source_depletion.id IS NULL
    OR source_depletion."claimType"<>'pos_draft'
    OR source_depletion."claimId"<>source_hold.id
    OR source_depletion.kind<>'pos_handover'
    OR source_depletion."locationId"<>NEW."locationId"
    OR source_depletion."actorId"<>NEW."soldByUserId"
    OR NOT EXISTS(
      SELECT 1 FROM "User" u
      WHERE u.id=NEW."soldByUserId" AND u.role='admin' AND u.active
    )
    OR EXISTS(
      SELECT 1 FROM "PosStockHoldLine" line
        JOIN "Variant" v ON v.id=line."variantId"
        JOIN "Product" p ON p.id=v."productId"
        JOIN "Category" c ON c.id=p."categoryId"
      WHERE line."holdId"=source_hold.id
        AND (NOT v.active OR NOT p.published OR NOT c.active
          OR v."priceMinor"<>line."unitPriceMinor")
    )
  THEN RAISE EXCEPTION 'POS cash sale source or current price is invalid'
    USING ERRCODE='23514';
  END IF;
  SELECT source_till."openingFloatMinor"::BIGINT
    + COALESCE((SELECT sum(CASE WHEN kind='cash_in' THEN "amountMinor"
                               ELSE -"amountMinor" END)
       FROM "CashierTillMovement" WHERE "sessionId"=source_till.id),0)
    + COALESCE((SELECT sum("subtotalMinor") FROM "PosCashSale"
       WHERE "tillSessionId"=source_till.id),0)
    + NEW."subtotalMinor"
    INTO drawer_balance;
  IF drawer_balance<0 OR drawer_balance>100000000 THEN
    RAISE EXCEPTION 'POS sale exceeds permitted recorded till cash balance'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER pos_cash_sale_immutable BEFORE INSERT OR UPDATE OR DELETE
  ON "PosCashSale" FOR EACH ROW EXECUTE FUNCTION verify_pos_cash_sale();

-- Complete a valid hold exactly once, and never rewrite original identity.
CREATE OR REPLACE FUNCTION verify_pos_stock_hold() RETURNS trigger AS $$
DECLARE till_row "CashierTillSession"%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'POS holds are immutable evidence' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO till_row FROM "CashierTillSession"
      WHERE id=NEW."tillSessionId" FOR UPDATE;
    IF till_row.id IS NULL OR till_row.status<>'open'
      OR till_row."locationId"<>NEW."locationId"
      OR NEW.status<>'held'
      OR NOT EXISTS(SELECT 1 FROM "User"
        WHERE id=NEW."createdByUserId" AND role='admin' AND active)
      OR NEW."expiresAt"<=now()
      OR NEW."expiresAt">now()+interval '5 minutes 30 seconds'
    THEN RAISE EXCEPTION 'POS hold requires a valid open till and authorised staff'
      USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'held' OR NEW.status NOT IN ('released','expired','consumed')
    OR (NEW.id,NEW."tillSessionId",NEW."locationId",NEW."createdByUserId",
        NEW."subtotalMinor",NEW."createdAt",NEW."expiresAt")
       IS DISTINCT FROM
       (OLD.id,OLD."tillSessionId",OLD."locationId",OLD."createdByUserId",
        OLD."subtotalMinor",OLD."createdAt",OLD."expiresAt")
    OR (NEW.status='expired' AND OLD."expiresAt">now())
    OR (NEW.status='consumed' AND
      (OLD."expiresAt"<=now() OR NOT EXISTS(
        SELECT 1 FROM "PosCashSale" sale
        JOIN "StockDepletion" d ON d.id=sale."stockDepletionId"
        WHERE sale."holdId"=OLD.id AND d."claimType"='pos_draft'
          AND d."claimId"=OLD.id AND d.kind='pos_handover'
      )))
  THEN RAISE EXCEPTION 'POS hold cannot change without valid one-way sale or release'
    USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Deferrable commit checks: neither direct SQL nor a failed half-transaction
-- may leave depleted POS stock without its one-and-only cash sale and handover.
CREATE FUNCTION verify_pos_cash_commit() RETURNS trigger AS $$
DECLARE sale_id TEXT;
DECLARE cash_sale "PosCashSale"%ROWTYPE;
DECLARE source_hold "PosStockHold"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='PosCashSale' THEN
    sale_id:=NEW.id;
  ELSIF NEW."claimType"='pos_draft' THEN
    SELECT id INTO sale_id FROM "PosCashSale"
      WHERE "stockDepletionId"=NEW.id;
  ELSE
    RETURN NULL;
  END IF;
  SELECT * INTO cash_sale FROM "PosCashSale" WHERE id=sale_id;
  SELECT * INTO source_hold FROM "PosStockHold"
    WHERE id=cash_sale."holdId";
  IF cash_sale.id IS NULL OR source_hold.id IS NULL
    OR source_hold.status<>'consumed'
    OR EXISTS(
      SELECT 1 FROM "Reservation"
      WHERE "claimType"='pos_draft' AND "claimId"=source_hold.id
        AND state<>'consumed'
    )
    OR NOT EXISTS(
      SELECT 1 FROM "StockDepletion" d
        JOIN "StockDepletionLine" line ON line."depletionId"=d.id
      WHERE d.id=cash_sale."stockDepletionId" AND d."claimType"='pos_draft'
        AND d."claimId"=source_hold.id
    )
  THEN RAISE EXCEPTION 'completed POS sale requires consumed original hold and stock'
    USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER pos_cash_sale_commit_guard
  AFTER INSERT ON "PosCashSale" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_pos_cash_commit();
CREATE CONSTRAINT TRIGGER pos_depletion_sale_commit_guard
  AFTER INSERT ON "StockDepletion" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_pos_cash_commit();

-- Shift count and permitted cash drops must now include real cash sales.
-- This does not pretend that electronic settlements or refunds are supported.
CREATE OR REPLACE FUNCTION validate_cashier_till_session() RETURNS trigger AS $$
DECLARE balance BIGINT;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'till session evidence cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'open'
      OR NOT EXISTS(SELECT 1 FROM "Location"
        WHERE id=NEW."locationId" AND active)
      OR NOT EXISTS(SELECT 1 FROM "User"
        WHERE id=NEW."openedByUserId" AND role='admin' AND active)
    THEN RAISE EXCEPTION 'only active administrator may open a till at an active location'
      USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'open' OR NEW.status<>'closed'
    OR (NEW.id,NEW."locationId",NEW."tillCode",NEW."openedByUserId",
        NEW."openingFloatMinor",NEW."openedAt") IS DISTINCT FROM
       (OLD.id,OLD."locationId",OLD."tillCode",OLD."openedByUserId",
        OLD."openingFloatMinor",OLD."openedAt")
    OR NOT EXISTS(SELECT 1 FROM "User"
        WHERE id=NEW."closedByUserId" AND role='admin' AND active)
  THEN RAISE EXCEPTION 'till sessions are immutable except one authorised close'
    USING ERRCODE='23514'; END IF;
  SELECT OLD."openingFloatMinor"::BIGINT
    + COALESCE((SELECT sum(CASE WHEN kind='cash_in' THEN "amountMinor"
                               ELSE -"amountMinor" END)
       FROM "CashierTillMovement" WHERE "sessionId"=OLD.id),0)
    + COALESCE((SELECT sum("subtotalMinor") FROM "PosCashSale"
       WHERE "tillSessionId"=OLD.id),0) INTO balance;
  IF balance<0 OR balance>100000000
    OR NEW."closingExpectedMinor" IS DISTINCT FROM balance
  THEN RAISE EXCEPTION 'till closing expected cash must match movements plus POS cash sales'
    USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_cashier_till_movement() RETURNS trigger AS $$
DECLARE session_row "CashierTillSession"%ROWTYPE;
DECLARE balance BIGINT;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'cash movements are immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO session_row FROM "CashierTillSession"
    WHERE id=NEW."sessionId" FOR UPDATE;
  IF session_row.id IS NULL OR session_row.status<>'open'
    OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."actorUserId"
      AND role='admin' AND active)
  THEN RAISE EXCEPTION 'cash movement requires an open till and active administrator'
    USING ERRCODE='23514'; END IF;
  SELECT session_row."openingFloatMinor"::BIGINT
    + COALESCE((SELECT sum(CASE WHEN kind='cash_in' THEN "amountMinor"
                               ELSE -"amountMinor" END)
       FROM "CashierTillMovement" WHERE "sessionId"=session_row.id),0)
    + COALESCE((SELECT sum("subtotalMinor") FROM "PosCashSale"
       WHERE "tillSessionId"=session_row.id),0) INTO balance;
  balance := balance + CASE WHEN NEW.kind='cash_in' THEN NEW."amountMinor"
                            ELSE -NEW."amountMinor" END;
  IF balance<0 OR balance>100000000 THEN
    RAISE EXCEPTION 'cash movement cannot overdraw or exceed drawer limit'
      USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
