-- Retain the two existing SMS purposes and add only the order email purpose.
ALTER TABLE "CustomerOtpChallenge"
  DROP CONSTRAINT "CustomerOtpChallenge_purpose_check",
  ADD CONSTRAINT "CustomerOtpChallenge_purpose_check"
    CHECK ("purpose" IN ('phone_verification','sensitive_action','order_email_verification'));
