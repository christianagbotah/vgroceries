ALTER TABLE "Reservation"
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_generation_positive" CHECK ("generation" > 0);

DROP INDEX "Reservation_claimType_claimId_claimLineId_lotId_key";
CREATE UNIQUE INDEX "Reservation_claimType_claimId_claimLineId_lotId_generation_key"
  ON "Reservation"("claimType","claimId","claimLineId","lotId","generation");

CREATE TABLE "PaymentAttempt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "amountMinor" INTEGER NOT NULL,
  "merchantReference" TEXT NOT NULL,
  "providerRef" TEXT,
  "status" TEXT NOT NULL DEFAULT 'initiated',
  "initiationState" TEXT NOT NULL DEFAULT 'created',
  "settlementState" TEXT NOT NULL DEFAULT 'unsettled',
  "callbackCount" INTEGER NOT NULL DEFAULT 0,
  "failureCode" TEXT,
  "failureReason" TEXT,
  "providerExpiresAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentAttempt_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentAttempt_currency_ghs" CHECK ("currency" = 'GHS'),
  CONSTRAINT "PaymentAttempt_method_check" CHECK ("method" IN ('mobile_money','card_hosted','bank_transfer')),
  CONSTRAINT "PaymentAttempt_status_check" CHECK ("status" IN ('initiated','pending','succeeded','failed','expired')),
  CONSTRAINT "PaymentAttempt_initiationState_check" CHECK ("initiationState" IN ('created','accepted','uncertain','rejected')),
  CONSTRAINT "PaymentAttempt_settlementState_check" CHECK ("settlementState" IN ('unsettled','settled','reconciled','exception')),
  CONSTRAINT "PaymentAttempt_callbackCount_nonnegative" CHECK ("callbackCount" >= 0),
  CONSTRAINT "PaymentAttempt_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "PaymentAttempt_merchantReference_key" ON "PaymentAttempt"("merchantReference");
CREATE UNIQUE INDEX "PaymentAttempt_provider_providerRef_key" ON "PaymentAttempt"("provider","providerRef");
CREATE UNIQUE INDEX "PaymentAttempt_one_live_per_order" ON "PaymentAttempt"("orderId") WHERE "status" IN ('initiated','pending');
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId","createdAt");
CREATE INDEX "PaymentAttempt_status_settlementState_createdAt_idx" ON "PaymentAttempt"("status","settlementState","createdAt");

CREATE TABLE "PaymentProviderEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "paymentAttemptId" TEXT,
  "providerRef" TEXT,
  "rawBodyHash" TEXT NOT NULL,
  "verificationResult" TEXT NOT NULL,
  "observedState" TEXT,
  "observedAmountMinor" INTEGER,
  "observedCurrency" TEXT,
  "providerTimestamp" TIMESTAMPTZ(3),
  "processingResult" TEXT,
  "safeMetadata" JSONB NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentProviderEvent_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentProviderEvent_rawBodyHash_hex" CHECK ("rawBodyHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PaymentProviderEvent_verificationResult_check" CHECK ("verificationResult" IN ('verified','lookup_required','invalid')),
  CONSTRAINT "PaymentProviderEvent_observedState_check" CHECK ("observedState" IS NULL OR "observedState" IN ('pending','succeeded','failed','expired','unknown')),
  CONSTRAINT "PaymentProviderEvent_observedAmount_nonnegative" CHECK ("observedAmountMinor" IS NULL OR "observedAmountMinor" >= 0),
  CONSTRAINT "PaymentProviderEvent_observedCurrency_check" CHECK ("observedCurrency" IS NULL OR "observedCurrency" = 'GHS'),
  CONSTRAINT "PaymentProviderEvent_processingResult_check" CHECK ("processingResult" IS NULL OR "processingResult" IN ('duplicate','applied','pending','mismatch','exception','rejected'))
);
CREATE UNIQUE INDEX "PaymentProviderEvent_provider_providerEventId_key" ON "PaymentProviderEvent"("provider","providerEventId");
CREATE UNIQUE INDEX "PaymentProviderEvent_provider_dedupeKey_key" ON "PaymentProviderEvent"("provider","dedupeKey");
CREATE INDEX "PaymentProviderEvent_paymentAttemptId_receivedAt_idx" ON "PaymentProviderEvent"("paymentAttemptId","receivedAt");
CREATE INDEX "PaymentProviderEvent_provider_processingResult_receivedAt_idx" ON "PaymentProviderEvent"("provider","processingResult","receivedAt");

CREATE TABLE "PaymentReconciliation" (
  "id" TEXT NOT NULL,
  "paymentAttemptId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "observedState" TEXT NOT NULL,
  "providerRef" TEXT,
  "observedAmountMinor" INTEGER,
  "observedCurrency" TEXT,
  "result" TEXT NOT NULL,
  "safeNote" TEXT,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentReconciliation_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentReconciliation_trigger_check" CHECK ("trigger" IN ('webhook','customer_retry','staff','worker')),
  CONSTRAINT "PaymentReconciliation_observedState_check" CHECK ("observedState" IN ('pending','succeeded','failed','expired','unknown')),
  CONSTRAINT "PaymentReconciliation_observedAmount_nonnegative" CHECK ("observedAmountMinor" IS NULL OR "observedAmountMinor" >= 0),
  CONSTRAINT "PaymentReconciliation_observedCurrency_check" CHECK ("observedCurrency" IS NULL OR "observedCurrency" = 'GHS'),
  CONSTRAINT "PaymentReconciliation_result_check" CHECK ("result" IN ('matched','state_changed','no_record','mismatch','exception'))
);
CREATE INDEX "PaymentReconciliation_paymentAttemptId_createdAt_idx" ON "PaymentReconciliation"("paymentAttemptId","createdAt");
CREATE INDEX "PaymentReconciliation_provider_result_createdAt_idx" ON "PaymentReconciliation"("provider","result","createdAt");

CREATE OR REPLACE FUNCTION prevent_payment_attempt_identity_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."provider" IS DISTINCT FROM OLD."provider"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
     OR NEW."merchantReference" IS DISTINCT FROM OLD."merchantReference" THEN
    RAISE EXCEPTION 'payment attempt financial identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PaymentAttempt_identity_immutable" BEFORE UPDATE ON "PaymentAttempt" FOR EACH ROW EXECUTE FUNCTION prevent_payment_attempt_identity_rewrite();

CREATE OR REPLACE FUNCTION protect_payment_provider_event_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment provider evidence cannot be deleted';
  END IF;
  IF NEW."provider" IS DISTINCT FROM OLD."provider"
     OR NEW."providerEventId" IS DISTINCT FROM OLD."providerEventId"
     OR NEW."dedupeKey" IS DISTINCT FROM OLD."dedupeKey"
     OR NEW."providerRef" IS DISTINCT FROM OLD."providerRef"
     OR NEW."rawBodyHash" IS DISTINCT FROM OLD."rawBodyHash"
     OR NEW."verificationResult" IS DISTINCT FROM OLD."verificationResult"
     OR NEW."observedState" IS DISTINCT FROM OLD."observedState"
     OR NEW."observedAmountMinor" IS DISTINCT FROM OLD."observedAmountMinor"
     OR NEW."observedCurrency" IS DISTINCT FROM OLD."observedCurrency"
     OR NEW."providerTimestamp" IS DISTINCT FROM OLD."providerTimestamp"
     OR NEW."safeMetadata" IS DISTINCT FROM OLD."safeMetadata"
     OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt" THEN
    RAISE EXCEPTION 'payment provider evidence is immutable';
  END IF;
  IF OLD."paymentAttemptId" IS NOT NULL AND NEW."paymentAttemptId" IS DISTINCT FROM OLD."paymentAttemptId" THEN
    RAISE EXCEPTION 'resolved payment attempt cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PaymentProviderEvent_evidence_immutable" BEFORE UPDATE OR DELETE ON "PaymentProviderEvent" FOR EACH ROW EXECUTE FUNCTION protect_payment_provider_event_evidence();

CREATE OR REPLACE FUNCTION prevent_payment_reconciliation_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment reconciliation history is append-only';
END;
$$;
CREATE TRIGGER "PaymentReconciliation_immutable" BEFORE UPDATE OR DELETE ON "PaymentReconciliation" FOR EACH ROW EXECUTE FUNCTION prevent_payment_reconciliation_rewrite();
