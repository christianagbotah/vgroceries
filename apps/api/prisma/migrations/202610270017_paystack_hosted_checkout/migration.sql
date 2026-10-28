ALTER TABLE "PaymentAttempt" ADD COLUMN "settledChannel" TEXT;

ALTER TABLE "PaymentAttempt" DROP CONSTRAINT "PaymentAttempt_method_check";
ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_method_check"
CHECK ("method" IN ('hosted_checkout','mobile_money','card_hosted','bank_transfer'));

ALTER TABLE "Refund" DROP CONSTRAINT "Refund_method_check";
ALTER TABLE "Refund"
ADD CONSTRAINT "Refund_method_check"
CHECK ("method" IN ('hosted_checkout','mobile_money','card_hosted','bank_transfer'));

ALTER TABLE "RefundExecution" DROP CONSTRAINT "RefundExecution_method_check";
ALTER TABLE "RefundExecution"
ADD CONSTRAINT "RefundExecution_method_check"
CHECK ("method" IN ('hosted_checkout','mobile_money','card_hosted','bank_transfer'));

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_settledChannel_check"
CHECK ("settledChannel" IS NULL OR "settledChannel" ~ '^[a-z0-9_]{1,64}$');
