-- COD D1: rider-declared physical cash custody, NOT confirmed settlement.
-- No payment status, rider liability, refund, till balance or stock mutation.
-- All evidence is append-only and cannot be fabricated by delivery proof.
CREATE TABLE "CodCashDeclaration" (
  id TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "riderProfileId" TEXT NOT NULL,
  "declaredByUserId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "cashCountConfirmed" BOOLEAN NOT NULL,
  "riderPossessionConfirmed" BOOLEAN NOT NULL,
  note TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodCashDeclaration_pkey" PRIMARY KEY (id),
  CONSTRAINT "CodCashDeclaration_amount_check" CHECK ("amountMinor" > 0 AND "amountMinor" <= 100000000),
  CONSTRAINT "CodCashDeclaration_attestation_check" CHECK ("cashCountConfirmed" AND "riderPossessionConfirmed"),
  CONSTRAINT "CodCashDeclaration_note_check" CHECK (length(trim(note)) BETWEEN 10 AND 400),
  CONSTRAINT "CodCashDeclaration_request_check" CHECK (length(trim("requestId")) >= 1),
  CONSTRAINT "CodCashDeclaration_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob" (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodCashDeclaration_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodCashDeclaration_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile" (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodCashDeclaration_declaredByUserId_fkey" FOREIGN KEY ("declaredByUserId") REFERENCES "User" (id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CodCashDeclaration_deliveryJobId_key" ON "CodCashDeclaration" ("deliveryJobId");
CREATE UNIQUE INDEX "CodCashDeclaration_orderId_key" ON "CodCashDeclaration" ("orderId");
CREATE INDEX "CodCashDeclaration_riderProfileId_createdAt_idx" ON "CodCashDeclaration" ("riderProfileId", "createdAt");

CREATE FUNCTION assert_cod_cash_declaration_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "DeliveryJob" j
    JOIN "Order" o ON o.id = j."orderId"
    JOIN "RiderProfile" r ON r.id = j."riderProfileId"
    JOIN "User" u ON u.id = r."userId"
    JOIN "DeliveryProof" p ON p."deliveryJobId" = j.id
    WHERE j.id = NEW."deliveryJobId"
      AND o.id = NEW."orderId"
      AND r.id = NEW."riderProfileId"
      AND u.id = NEW."declaredByUserId"
      AND u.role = 'rider' AND u.active
      AND j."assignmentKind" = 'rider'
      AND j.status = 'delivered' AND j."custodyState" = 'customer'
      AND j."deliveredAt" IS NOT NULL
      AND o.fulfilment = 'delivery' AND o."fulfilmentStatus" = 'delivered'
      AND o."deliveryStatus" = 'delivered'
      AND o."paymentMethod" = 'cash_on_delivery'
      AND o."paymentStatus" = 'unpaid'
      AND o."stockConsumedAt" IS NOT NULL AND o."cancelledAt" IS NULL
      AND o."totalMinor" = NEW."amountMinor"
    FOR SHARE OF j, o, r, u, p
  ) THEN
    RAISE EXCEPTION 'COD cash declaration requires owned, proven, completed unpaid rider delivery'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CodCashDeclaration_source_guard"
  BEFORE INSERT ON "CodCashDeclaration"
  FOR EACH ROW EXECUTE FUNCTION assert_cod_cash_declaration_source();
CREATE FUNCTION reject_cod_cash_declaration_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COD cash declaration evidence is immutable'
    USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "CodCashDeclaration_immutable"
  BEFORE UPDATE OR DELETE ON "CodCashDeclaration"
  FOR EACH ROW EXECUTE FUNCTION reject_cod_cash_declaration_rewrite();
