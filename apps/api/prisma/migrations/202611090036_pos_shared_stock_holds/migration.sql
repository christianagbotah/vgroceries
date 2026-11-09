-- P0b2: short-lived POS reservations share the very same lot and position
-- rows as online checkout. This creates NO order, sale, tender or depletion.
CREATE TABLE "PosStockHold" (
  id TEXT PRIMARY KEY,
  "tillSessionId" TEXT NOT NULL REFERENCES "CashierTillSession"(id) ON DELETE RESTRICT,
  "locationId" TEXT NOT NULL REFERENCES "Location"(id) ON DELETE RESTRICT,
  "createdByUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'held',
  "subtotalMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "releasedAt" TIMESTAMPTZ(3),
  "releaseNote" TEXT,
  CONSTRAINT pos_hold_state CHECK(status IN ('held','released','expired')),
  CONSTRAINT pos_hold_subtotal CHECK("subtotalMinor" BETWEEN 0 AND 100000000),
  CONSTRAINT pos_hold_expiry CHECK("expiresAt">"createdAt" AND
    "expiresAt"<="createdAt"+interval '5 minutes 30 seconds'),
  CONSTRAINT pos_hold_release_shape CHECK(
    (status='held' AND "releasedAt" IS NULL AND "releaseNote" IS NULL)
    OR
    (status IN ('released','expired') AND "releasedAt" IS NOT NULL
      AND "releaseNote" IS NOT NULL
      AND char_length(btrim("releaseNote")) BETWEEN 10 AND 400)
  )
);
CREATE UNIQUE INDEX pos_one_held_cart_per_till ON "PosStockHold"("tillSessionId")
 WHERE status='held';
CREATE INDEX pos_holds_by_till ON "PosStockHold"("tillSessionId",status,"expiresAt");
CREATE INDEX pos_holds_by_location ON "PosStockHold"("locationId","createdAt");

CREATE TABLE "PosStockHoldLine" (
  id TEXT PRIMARY KEY,
  "holdId" TEXT NOT NULL REFERENCES "PosStockHold"(id) ON DELETE RESTRICT,
  "variantId" TEXT NOT NULL REFERENCES "Variant"(id) ON DELETE RESTRICT,
  quantity DECIMAL(15,3) NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "lineTotalMinor" INTEGER NOT NULL,
  CONSTRAINT pos_hold_line_quantity CHECK(quantity>0),
  CONSTRAINT pos_hold_line_price CHECK("unitPriceMinor" BETWEEN 0 AND 100000000
    AND "lineTotalMinor" BETWEEN 0 AND 100000000),
  CONSTRAINT pos_hold_line_unique UNIQUE ("holdId","variantId")
);

CREATE FUNCTION verify_pos_stock_hold() RETURNS trigger AS $$
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
  IF OLD.status<>'held' OR NEW.status NOT IN ('released','expired')
    OR (NEW.id,NEW."tillSessionId",NEW."locationId",NEW."createdByUserId",
        NEW."subtotalMinor",NEW."createdAt",NEW."expiresAt")
       IS DISTINCT FROM
       (OLD.id,OLD."tillSessionId",OLD."locationId",OLD."createdByUserId",
        OLD."subtotalMinor",OLD."createdAt",OLD."expiresAt")
    OR (NEW.status='expired' AND OLD."expiresAt">now())
  THEN RAISE EXCEPTION 'POS hold can only transition once to released or expired'
    USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER pos_hold_state_guard BEFORE INSERT OR UPDATE OR DELETE
  ON "PosStockHold" FOR EACH ROW EXECUTE FUNCTION verify_pos_stock_hold();

CREATE FUNCTION verify_pos_hold_line() RETURNS trigger AS $$
DECLARE holder "PosStockHold"%ROWTYPE;
DECLARE product_unit TEXT;
DECLARE product_price INTEGER;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'POS hold lines cannot be edited or removed'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO holder FROM "PosStockHold" WHERE id=NEW."holdId";
  SELECT v.unit,v."priceMinor" INTO product_unit,product_price
    FROM "Variant" v JOIN "Product" p ON p.id=v."productId"
    JOIN "Category" c ON c.id=p."categoryId"
    WHERE v.id=NEW."variantId" AND v.active AND p.published AND c.active;
  IF holder.id IS NULL OR holder.status<>'held' OR holder."expiresAt"<=now()
    OR product_unit IS NULL OR NEW.quantity<=0
    OR (product_unit NOT IN ('kg','litre') AND NEW.quantity<>trunc(NEW.quantity))
    OR NEW."unitPriceMinor"<>product_price
    OR NEW."lineTotalMinor"<>round(product_price::numeric*NEW.quantity)::integer
  THEN RAISE EXCEPTION 'POS hold line requires active catalog stock and server price'
    USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER pos_hold_line_guard BEFORE INSERT OR UPDATE OR DELETE
  ON "PosStockHoldLine" FOR EACH ROW EXECUTE FUNCTION verify_pos_hold_line();

-- Database provenance for every new pos_draft reservation, including callers
-- bypassing the Nest API. Online order reservations remain unchanged.
CREATE FUNCTION verify_pos_draft_reservation() RETURNS trigger AS $$
DECLARE source_hold "PosStockHold"%ROWTYPE;
BEGIN
  IF NEW."claimType"<>'pos_draft' THEN RETURN NEW; END IF;
  SELECT * INTO source_hold FROM "PosStockHold" WHERE id=NEW."claimId";
  IF source_hold.id IS NULL OR source_hold.status<>'held'
    OR source_hold."expiresAt"<=now()
    OR NEW."expiresAt" IS DISTINCT FROM source_hold."expiresAt"
    OR NOT EXISTS(
      SELECT 1 FROM "PosStockHoldLine" l
      JOIN "StockPosition" p ON p."variantId"=l."variantId"
      WHERE l.id=NEW."claimLineId" AND l."holdId"=source_hold.id
        AND p.id=NEW."positionId" AND p."locationId"=source_hold."locationId"
    )
  THEN RAISE EXCEPTION 'POS draft allocation must match an active source hold'
    USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER pos_draft_reservation_insert_guard BEFORE INSERT ON "Reservation"
 FOR EACH ROW EXECUTE FUNCTION verify_pos_draft_reservation();

-- Assert complete, exact quantities when each hold or line is created.
-- The same deferred function also checks new reservations so no other writer
-- can silently over-allocate a POS draft beyond its item quantities.
CREATE FUNCTION verify_pos_draft_aggregate() RETURNS trigger AS $$
DECLARE hold_id TEXT;
DECLARE source_hold "PosStockHold"%ROWTYPE;
DECLARE count_lines INTEGER;
DECLARE sum_minor BIGINT;
BEGIN
  IF TG_TABLE_NAME='PosStockHold' THEN
    hold_id:=NEW.id;
  ELSIF TG_TABLE_NAME='PosStockHoldLine' THEN
    hold_id:=NEW."holdId";
  ELSIF NEW."claimType"='pos_draft' THEN
    hold_id:=NEW."claimId";
  ELSE
    RETURN NULL;
  END IF;
  SELECT * INTO source_hold FROM "PosStockHold" WHERE id=hold_id;
  IF source_hold.id IS NULL THEN
    RAISE EXCEPTION 'POS draft reservation has no valid hold'
      USING ERRCODE='23514'; END IF;
  SELECT count(*),COALESCE(sum("lineTotalMinor"),0)
    INTO count_lines,sum_minor FROM "PosStockHoldLine" WHERE "holdId"=hold_id;
  IF count_lines<1 OR count_lines>100 OR sum_minor<>source_hold."subtotalMinor"
    OR EXISTS(
      SELECT 1 FROM "PosStockHoldLine" l
      LEFT JOIN "Reservation" r
        ON r."claimType"='pos_draft' AND r."claimId"=hold_id
        AND r."claimLineId"=l.id
      WHERE l."holdId"=hold_id
      GROUP BY l.id,l.quantity
      HAVING COALESCE(sum(r.quantity),0)<>l.quantity
    )
    OR EXISTS(
      SELECT 1 FROM "Reservation" r
      LEFT JOIN "PosStockHoldLine" l
        ON l.id=r."claimLineId" AND l."holdId"=hold_id
      WHERE r."claimType"='pos_draft' AND r."claimId"=hold_id AND l.id IS NULL
    )
  THEN RAISE EXCEPTION 'POS hold must exactly match original stock reservations'
    USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER pos_hold_complete_at_commit AFTER INSERT ON "PosStockHold"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_pos_draft_aggregate();
CREATE CONSTRAINT TRIGGER pos_hold_line_complete_at_commit AFTER INSERT ON "PosStockHoldLine"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_pos_draft_aggregate();
CREATE CONSTRAINT TRIGGER pos_reservation_complete_at_commit AFTER INSERT ON "Reservation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_pos_draft_aggregate();

-- The first POS release must prevent a cashier from closing a till while
-- active and unexpired stock holds are still live.
CREATE FUNCTION forbid_till_close_with_pos_holds() RETURNS trigger AS $$
BEGIN
  IF OLD.status='open' AND NEW.status='closed' AND EXISTS (
    SELECT 1 FROM "PosStockHold" h
    WHERE h."tillSessionId"=OLD.id AND h.status='held' AND h."expiresAt">now()
  ) THEN
    RAISE EXCEPTION 'release reserved POS carts before closing the till'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER pos_hold_till_close_guard BEFORE UPDATE ON "CashierTillSession"
 FOR EACH ROW EXECUTE FUNCTION forbid_till_close_with_pos_holds();
