-- Scoped cashier POS activation authority (still behind existing feature flags).
-- Separate read rights from cash-sale writes. No MoMo, card, taxes or refunds.
-- Till opening/closing and drawer movements REMAIN admin-only.
-- Existing transaction, immutable receipt, stock, replay and price integrity
-- checks are preserved verbatim; only active cashier branch/ownership logic
-- is added. This migration cannot independently activate a POS flag.

-- Secure by default: no public, customer, rider, inventory manager or
-- inactive user can sell. Cashiers require a current, active branch grant.
-- Administrator rights remain global for supervised staging and till setup.
CREATE FUNCTION pos_cashier_allowed_at_location(staff_id TEXT,branch_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM "User" staff
    JOIN "Location" branch ON branch.id=branch_id AND branch.active
    WHERE staff.id=staff_id AND staff.active
      AND (staff.role='admin' OR (
        staff.role='cashier' AND EXISTS(
          SELECT 1 FROM "UserLocation" grant
          WHERE grant."userId"=staff.id AND grant."locationId"=branch.id
        )
      ))
  );
$$;

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
    OR NOT pos_cashier_allowed_at_location(NEW."soldByUserId",NEW."locationId")
    OR (source_hold."createdByUserId"<>NEW."soldByUserId"
        AND EXISTS(SELECT 1 FROM "User" WHERE id=NEW."soldByUserId" AND role='cashier'))
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
      OR NOT pos_cashier_allowed_at_location(NEW."createdByUserId",NEW."locationId")
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
