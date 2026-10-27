ALTER TABLE "Order" DROP CONSTRAINT "Order_paymentMethod_check";

ALTER TABLE "Order"
ADD CONSTRAINT "Order_paymentMethod_check"
CHECK (
  "paymentMethod" IN (
    'electronic',
    'mobile_money',
    'card_hosted',
    'bank_transfer',
    'cash_counter',
    'cash_on_delivery'
  )
);
