ALTER TABLE "RefundReconciliation"
  DROP CONSTRAINT "RefundReconciliation_trigger_check";

ALTER TABLE "RefundReconciliation"
  ADD CONSTRAINT "RefundReconciliation_trigger_check"
  CHECK ("trigger" IN ('execute_recovery','retry','manual_reconcile','provider_callback'));
