-- Refunds Authority: durable obligations, one stable provider execution identity, append-only reconciliation.

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentAttemptId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "amountMinor" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "returnId" TEXT,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'awaiting_approval',
  "requestedBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMPTZ(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Refund_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Refund_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "Refund_currency_ghs" CHECK ("currency" = 'GHS'),
  CONSTRAINT "Refund_provider_identifier" CHECK ("provider" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT "Refund_method_check" CHECK ("method" IN ('mobile_money','card_hosted','bank_transfer')),
  CONSTRAINT "Refund_source_check" CHECK ("sourceType" IN ('customer_cancellation','payment_review_cancellation','overcharge_correction','return')),
  CONSTRAINT "Refund_status_check" CHECK ("status" IN ('awaiting_approval','approved','processing','succeeded','failed','requires_review')),
  CONSTRAINT "Refund_return_source_check" CHECK (("sourceType" = 'return' AND "returnId" IS NOT NULL) OR ("sourceType" <> 'return' AND "returnId" IS NULL)),
  CONSTRAINT "Refund_reason_check" CHECK (length(btrim("reason")) BETWEEN 1 AND 500),
  CONSTRAINT "Refund_version_positive" CHECK ("version" > 0)
);
CREATE INDEX "Refund_orderId_createdAt_idx" ON "Refund"("orderId","createdAt");
CREATE INDEX "Refund_paymentAttemptId_createdAt_idx" ON "Refund"("paymentAttemptId","createdAt");
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status","createdAt");

CREATE TABLE "RefundExecution" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "amountMinor" INTEGER NOT NULL,
  "merchantRefundReference" TEXT NOT NULL,
  "originalPaymentMerchantReference" TEXT NOT NULL,
  "originalPaymentProviderReference" TEXT,
  "providerRefundReference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'created',
  "reconciliationState" TEXT NOT NULL DEFAULT 'unreconciled',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "failureCode" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "RefundExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundExecution_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RefundExecution_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "RefundExecution_currency_ghs" CHECK ("currency" = 'GHS'),
  CONSTRAINT "RefundExecution_provider_identifier" CHECK ("provider" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT "RefundExecution_method_check" CHECK ("method" IN ('mobile_money','card_hosted','bank_transfer')),
  CONSTRAINT "RefundExecution_status_check" CHECK ("status" IN ('created','pending','succeeded','failed','uncertain')),
  CONSTRAINT "RefundExecution_reconciliationState_check" CHECK ("reconciliationState" IN ('unreconciled','reconciled','exception')),
  CONSTRAINT "RefundExecution_attemptCount_nonnegative" CHECK ("attemptCount" >= 0),
  CONSTRAINT "RefundExecution_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "RefundExecution_refundId_key" ON "RefundExecution"("refundId");
CREATE UNIQUE INDEX "RefundExecution_merchantRefundReference_key" ON "RefundExecution"("merchantRefundReference");
CREATE UNIQUE INDEX "RefundExecution_provider_providerRefundReference_key" ON "RefundExecution"("provider","providerRefundReference");
CREATE INDEX "RefundExecution_status_reconciliationState_createdAt_idx" ON "RefundExecution"("status","reconciliationState","createdAt");

CREATE TABLE "RefundReconciliation" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "refundExecutionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "observedState" TEXT NOT NULL,
  "providerRefundReference" TEXT,
  "observedAmountMinor" INTEGER,
  "observedCurrency" TEXT,
  "result" TEXT NOT NULL,
  "safeNote" TEXT,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundReconciliation_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RefundReconciliation_refundExecutionId_fkey" FOREIGN KEY ("refundExecutionId") REFERENCES "RefundExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RefundReconciliation_provider_identifier" CHECK ("provider" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT "RefundReconciliation_trigger_check" CHECK ("trigger" IN ('execute_recovery','retry','manual_reconcile')),
  CONSTRAINT "RefundReconciliation_observedState_check" CHECK ("observedState" IN ('pending','succeeded','failed','not_found','unknown')),
  CONSTRAINT "RefundReconciliation_observedAmount_nonnegative" CHECK ("observedAmountMinor" IS NULL OR "observedAmountMinor" >= 0),
  CONSTRAINT "RefundReconciliation_observedCurrency_check" CHECK ("observedCurrency" IS NULL OR "observedCurrency" = 'GHS'),
  CONSTRAINT "RefundReconciliation_result_check" CHECK ("result" IN ('matched','pending','failed','no_record','exception'))
);
CREATE INDEX "RefundReconciliation_refundExecutionId_createdAt_idx" ON "RefundReconciliation"("refundExecutionId","createdAt");
CREATE INDEX "RefundReconciliation_refundId_createdAt_idx" ON "RefundReconciliation"("refundId","createdAt");
CREATE INDEX "RefundReconciliation_provider_result_createdAt_idx" ON "RefundReconciliation"("provider","result","createdAt");

CREATE OR REPLACE FUNCTION protect_refund_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refund obligations cannot be deleted';
  END IF;
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."paymentAttemptId" IS DISTINCT FROM OLD."paymentAttemptId"
     OR NEW."provider" IS DISTINCT FROM OLD."provider"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
     OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
     OR NEW."returnId" IS DISTINCT FROM OLD."returnId" THEN
    RAISE EXCEPTION 'refund financial identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Refund_identity_immutable" BEFORE UPDATE OR DELETE ON "Refund" FOR EACH ROW EXECUTE FUNCTION protect_refund_identity();

CREATE OR REPLACE FUNCTION protect_refund_execution_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refund execution cannot be deleted';
  END IF;
  IF NEW."refundId" IS DISTINCT FROM OLD."refundId"
     OR NEW."provider" IS DISTINCT FROM OLD."provider"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
     OR NEW."merchantRefundReference" IS DISTINCT FROM OLD."merchantRefundReference"
     OR NEW."originalPaymentMerchantReference" IS DISTINCT FROM OLD."originalPaymentMerchantReference"
     OR NEW."originalPaymentProviderReference" IS DISTINCT FROM OLD."originalPaymentProviderReference"
     OR (OLD."providerRefundReference" IS NOT NULL AND NEW."providerRefundReference" IS DISTINCT FROM OLD."providerRefundReference") THEN
    RAISE EXCEPTION 'refund execution financial identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RefundExecution_identity_immutable" BEFORE UPDATE OR DELETE ON "RefundExecution" FOR EACH ROW EXECUTE FUNCTION protect_refund_execution_identity();

CREATE OR REPLACE FUNCTION prevent_refund_reconciliation_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'refund reconciliation history is append-only';
END;
$$;
CREATE TRIGGER "RefundReconciliation_append_only" BEFORE UPDATE OR DELETE ON "RefundReconciliation" FOR EACH ROW EXECUTE FUNCTION prevent_refund_reconciliation_rewrite();
