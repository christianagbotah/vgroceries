-- COD D2: two independent, immutable physical-cash count observations.
-- NEVER merchant cash acceptance, payment settlement, remittance or debt.
CREATE TABLE "CodSupervisorCount" (
  id TEXT NOT NULL,
  "declarationId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "physicalCashPresentConfirmed" BOOLEAN NOT NULL,
  "independentCountConfirmed" BOOLEAN NOT NULL,
  note TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodSupervisorCount_pkey" PRIMARY KEY (id),
  CONSTRAINT "CodSupervisorCount_sequence_check" CHECK (sequence IN (1, 2)),
  CONSTRAINT "CodSupervisorCount_amount_check" CHECK ("amountMinor" BETWEEN 0 AND 100000000),
  CONSTRAINT "CodSupervisorCount_attestation_check" CHECK ("physicalCashPresentConfirmed" AND "independentCountConfirmed"),
  CONSTRAINT "CodSupervisorCount_note_check" CHECK (length(trim(note)) BETWEEN 10 AND 400),
  CONSTRAINT "CodSupervisorCount_request_check" CHECK (length(trim("requestId")) >= 1),
  CONSTRAINT "CodSupervisorCount_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "CodCashDeclaration"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSupervisorCount_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CodSupervisorCount_declarationId_sequence_key" ON "CodSupervisorCount" ("declarationId", sequence);
CREATE UNIQUE INDEX "CodSupervisorCount_declarationId_reviewerUserId_key" ON "CodSupervisorCount" ("declarationId", "reviewerUserId");
CREATE INDEX "CodSupervisorCount_reviewerUserId_createdAt_idx" ON "CodSupervisorCount" ("reviewerUserId", "createdAt");

-- The lock serializes even direct SQL inserts for one declaration. Actor,
-- provenance, immutable original rider statement and payment state must agree.
CREATE FUNCTION assert_cod_supervisor_count_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."declarationId", 42));
  IF NOT EXISTS (
    SELECT 1 FROM "CodCashDeclaration" d
    JOIN "Order" o ON o.id=d."orderId"
    JOIN "DeliveryJob" j ON j.id=d."deliveryJobId"
    JOIN "DeliveryProof" p ON p."deliveryJobId"=j.id
    JOIN "User" u ON u.id=NEW."reviewerUserId"
    WHERE d.id=NEW."declarationId"
      AND u.role='admin' AND u.active AND u.id<>d."declaredByUserId"
      AND o.fulfilment='delivery' AND o."fulfilmentStatus"='delivered'
      AND o."deliveryStatus"='delivered' AND o."paymentMethod"='cash_on_delivery'
      AND o."paymentStatus"='unpaid' AND o."cancelledAt" IS NULL
      AND o."stockConsumedAt" IS NOT NULL
      AND j.status='delivered' AND j."deliveredAt" IS NOT NULL
      AND j."custodyState"='customer' AND j."orderId"=o.id
    FOR SHARE OF d,o,j,u,p
  ) THEN
    RAISE EXCEPTION 'Independent COD counting requires active administrator and proven unpaid rider declaration'
      USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO prior_count FROM "CodSupervisorCount" WHERE "declarationId"=NEW."declarationId";
  IF prior_count <> NEW.sequence-1 OR prior_count>=2 OR EXISTS (
    SELECT 1 FROM "CodSupervisorCount"
    WHERE "declarationId"=NEW."declarationId" AND "reviewerUserId"=NEW."reviewerUserId"
  ) THEN
    RAISE EXCEPTION 'COD supervisor count requires next distinct reviewer and a maximum of two observations'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CodSupervisorCount_source_guard"
  BEFORE INSERT ON "CodSupervisorCount"
  FOR EACH ROW EXECUTE FUNCTION assert_cod_supervisor_count_source();

CREATE FUNCTION reject_cod_supervisor_count_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COD supervisor count evidence is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "CodSupervisorCount_immutable"
  BEFORE UPDATE OR DELETE ON "CodSupervisorCount"
  FOR EACH ROW EXECUTE FUNCTION reject_cod_supervisor_count_rewrite();
