-- POS P0a: internal till preparation and cash movements ONLY.
-- Does not record a sale, verify payment or deplete stock. Default OFF.
CREATE TABLE "CashierTillSession" (
  id TEXT PRIMARY KEY,
  "locationId" TEXT NOT NULL REFERENCES "Location"(id) ON DELETE RESTRICT,
  "tillCode" TEXT NOT NULL,
  "openedByUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open',
  "openingFloatMinor" INTEGER NOT NULL,
  "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "closedAt" TIMESTAMPTZ(3),
  "closedByUserId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT,
  "closingCountedMinor" INTEGER,
  "closingExpectedMinor" INTEGER,
  "closingDifferenceMinor" INTEGER,
  "closeNote" TEXT,
  CONSTRAINT cashier_till_code CHECK ("tillCode" ~ '^[A-Z0-9_-]{1,32}$'),
  CONSTRAINT cashier_till_status CHECK(status IN ('open','closed')),
  CONSTRAINT cashier_till_float CHECK ("openingFloatMinor" BETWEEN 0 AND 100000000),
  CONSTRAINT cashier_till_close_fields CHECK (
    (status='open' AND "closedAt" IS NULL AND "closedByUserId" IS NULL
     AND "closingCountedMinor" IS NULL AND "closingExpectedMinor" IS NULL
     AND "closingDifferenceMinor" IS NULL AND "closeNote" IS NULL)
    OR (status='closed' AND "closedAt" IS NOT NULL AND "closedAt">="openedAt"
     AND "closedByUserId" IS NOT NULL
     AND "closingCountedMinor" IS NOT NULL
     AND "closingExpectedMinor" IS NOT NULL
     AND "closingDifferenceMinor" IS NOT NULL
     AND "closeNote" IS NOT NULL
     AND "closingCountedMinor" BETWEEN 0 AND 100000000
     AND "closingExpectedMinor" BETWEEN 0 AND 100000000
     AND "closingDifferenceMinor"="closingCountedMinor"-"closingExpectedMinor"
     AND char_length(btrim("closeNote")) BETWEEN 10 AND 400)
  )
);
CREATE UNIQUE INDEX cashier_one_open_till_per_location
  ON "CashierTillSession"("locationId","tillCode") WHERE status='open';
CREATE INDEX cashier_till_location_status ON "CashierTillSession"("locationId",status,"openedAt");
CREATE INDEX cashier_till_opened_by ON "CashierTillSession"("openedByUserId","openedAt");

CREATE TABLE "CashierTillMovement" (
  id TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL REFERENCES "CashierTillSession"(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  note TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT cashier_till_movement_kind CHECK(kind IN ('cash_in','cash_out','drop')),
  CONSTRAINT cashier_till_movement_amount CHECK("amountMinor" BETWEEN 1 AND 100000000),
  CONSTRAINT cashier_till_movement_note CHECK(char_length(btrim(note)) BETWEEN 10 AND 400)
);
CREATE INDEX cashier_till_movement_session_date
  ON "CashierTillMovement"("sessionId","createdAt");

CREATE FUNCTION validate_cashier_till_session() RETURNS trigger AS $$
DECLARE balance BIGINT;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'till session evidence cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'open'
      OR NOT EXISTS(SELECT 1 FROM "Location" WHERE id=NEW."locationId" AND active)
      OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."openedByUserId" AND role='admin' AND active)
    THEN RAISE EXCEPTION 'only active administrator may open a till at an active location'
      USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'open' OR NEW.status<>'closed'
    OR (NEW.id,NEW."locationId",NEW."tillCode",NEW."openedByUserId",
        NEW."openingFloatMinor",NEW."openedAt")
       IS DISTINCT FROM
       (OLD.id,OLD."locationId",OLD."tillCode",OLD."openedByUserId",
        OLD."openingFloatMinor",OLD."openedAt")
    OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."closedByUserId" AND role='admin' AND active)
  THEN
    RAISE EXCEPTION 'till sessions are immutable except one authorised close'
      USING ERRCODE='23514';
  END IF;
  SELECT OLD."openingFloatMinor"::BIGINT
    + COALESCE(SUM(CASE WHEN kind='cash_in' THEN "amountMinor"
                        ELSE -"amountMinor" END),0)
    INTO balance FROM "CashierTillMovement" WHERE "sessionId"=OLD.id;
  IF balance<0 OR balance>100000000
    OR NEW."closingExpectedMinor" IS DISTINCT FROM balance
  THEN
    RAISE EXCEPTION 'closing expected drawer amount must match immutable movement records'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cashier_till_session_guard
 BEFORE INSERT OR UPDATE OR DELETE ON "CashierTillSession"
 FOR EACH ROW EXECUTE FUNCTION validate_cashier_till_session();

CREATE FUNCTION validate_cashier_till_movement() RETURNS trigger AS $$
DECLARE session_row "CashierTillSession"%ROWTYPE;
DECLARE balance BIGINT;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'cash movements are immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO session_row FROM "CashierTillSession"
    WHERE id=NEW."sessionId" FOR UPDATE;
  IF session_row.id IS NULL OR session_row.status<>'open'
    OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."actorUserId" AND role='admin' AND active)
  THEN RAISE EXCEPTION 'cash movement requires an open till and active administrator'
    USING ERRCODE='23514'; END IF;
  SELECT session_row."openingFloatMinor"::BIGINT
    + COALESCE(SUM(CASE WHEN kind='cash_in' THEN "amountMinor"
                        ELSE -"amountMinor" END),0)
    INTO balance FROM "CashierTillMovement" WHERE "sessionId"=session_row.id;
  balance := balance + CASE WHEN NEW.kind='cash_in' THEN NEW."amountMinor"
                            ELSE -NEW."amountMinor" END;
  IF balance<0 OR balance>100000000 THEN
    RAISE EXCEPTION 'cash movement cannot overdraw or exceed drawer limit'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cashier_till_movement_guard
 BEFORE INSERT OR UPDATE OR DELETE ON "CashierTillMovement"
 FOR EACH ROW EXECUTE FUNCTION validate_cashier_till_movement();
