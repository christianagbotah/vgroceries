CREATE TABLE "GuestCheckoutSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "csrfHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestCheckoutSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestCheckoutSession_tokenHash_hex" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "GuestCheckoutSession_csrfHash_hex" CHECK ("csrfHash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "GuestCheckoutSession_tokenHash_key" ON "GuestCheckoutSession"("tokenHash");
CREATE INDEX "GuestCheckoutSession_expiresAt_revokedAt_idx" ON "GuestCheckoutSession"("expiresAt","revokedAt");

CREATE TABLE "CustomerAddress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "locality" TEXT NOT NULL,
  "street" TEXT NOT NULL,
  "landmark" TEXT,
  "ghanaPostGps" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CustomerAddress_userId_isDefault_idx" ON "CustomerAddress"("userId","isDefault");

CREATE TABLE "DeliveryZone" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "areas" TEXT[] NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "feeMinor" INTEGER NOT NULL,
  "minimumOrderMinor" INTEGER NOT NULL,
  "serviceHours" TEXT NOT NULL,
  "cutoff" TEXT NOT NULL,
  "slotsPerDay" INTEGER NOT NULL,
  "slotPolicy" TEXT NOT NULL DEFAULT 'required',
  "codEnabled" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryZone_money_nonnegative" CHECK ("feeMinor">=0 AND "minimumOrderMinor">=0),
  CONSTRAINT "DeliveryZone_slotsPerDay_nonnegative" CHECK ("slotsPerDay">=0),
  CONSTRAINT "DeliveryZone_slotPolicy_check" CHECK ("slotPolicy" IN ('required','optional','none'))
);
CREATE INDEX "DeliveryZone_active_name_idx" ON "DeliveryZone"("active","name");

CREATE TABLE "DeliverySlot" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "capacity" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "DeliverySlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliverySlot_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliverySlot_capacity_positive" CHECK ("capacity">0),
  CONSTRAINT "DeliverySlot_window_valid" CHECK ("endsAt">"startsAt")
);
CREATE INDEX "DeliverySlot_zoneId_active_startsAt_idx" ON "DeliverySlot"("zoneId","active","startsAt");

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'online',
  "customerUserId" TEXT,
  "guestSessionId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerEmail" TEXT,
  "fulfilment" TEXT NOT NULL,
  "zoneId" TEXT,
  "slotId" TEXT,
  "paymentMethod" TEXT NOT NULL,
  "paymentStatus" TEXT NOT NULL,
  "fulfilmentStatus" TEXT NOT NULL,
  "deliveryStatus" TEXT NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "discountMinor" INTEGER NOT NULL DEFAULT 0,
  "deliveryFeeMinor" INTEGER NOT NULL DEFAULT 0,
  "totalMinor" INTEGER NOT NULL,
  "verificationKeyVersion" INTEGER NOT NULL,
  "verificationCodeHash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "note" TEXT,
  "stockConsumedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "cancelledReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Order_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestCheckoutSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "DeliverySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_owner_xor" CHECK (("customerUserId" IS NOT NULL) <> ("guestSessionId" IS NOT NULL)),
  CONSTRAINT "Order_channel_check" CHECK ("channel" IN ('online','pos')),
  CONSTRAINT "Order_fulfilment_check" CHECK ("fulfilment" IN ('delivery','collection')),
  CONSTRAINT "Order_paymentMethod_check" CHECK ("paymentMethod" IN ('mobile_money','card_hosted','bank_transfer','cash_counter','cash_on_delivery')),
  CONSTRAINT "Order_paymentStatus_check" CHECK ("paymentStatus" IN ('unpaid','pending','succeeded','failed','expired','partially_refunded','refund_pending','refunded','requires_review')),
  CONSTRAINT "Order_fulfilmentStatus_check" CHECK ("fulfilmentStatus" IN ('awaiting_confirmation','confirmed','picking','packed','dispatched','delivered','ready_for_collection','collected','cancelled')),
  CONSTRAINT "Order_deliveryStatus_check" CHECK ("deliveryStatus" IN ('unassigned','assigned','accepted','picked_up','out_for_delivery','delivered','failed','rescheduled','return_to_store')),
  CONSTRAINT "Order_money_nonnegative" CHECK ("subtotalMinor">=0 AND "discountMinor">=0 AND "deliveryFeeMinor">=0 AND "totalMinor">=0),
  CONSTRAINT "Order_verification_version_positive" CHECK ("verificationKeyVersion">0),
  CONSTRAINT "Order_verification_digest_hex" CHECK ("verificationCodeHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "Order_version_positive" CHECK ("version">0)
);
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");
CREATE INDEX "Order_customerUserId_createdAt_idx" ON "Order"("customerUserId","createdAt");
CREATE INDEX "Order_guestSessionId_createdAt_idx" ON "Order"("guestSessionId","createdAt");
CREATE INDEX "Order_zoneId_createdAt_idx" ON "Order"("zoneId","createdAt");
CREATE INDEX "Order_slotId_createdAt_idx" ON "Order"("slotId","createdAt");

CREATE TABLE "OrderDeliveryAddress" (
  "orderId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "locality" TEXT NOT NULL,
  "street" TEXT NOT NULL,
  "landmark" TEXT,
  "ghanaPostGps" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderDeliveryAddress_pkey" PRIMARY KEY ("orderId"),
  CONSTRAINT "OrderDeliveryAddress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "OrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "variantName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "lineTotalMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderLine_quantity_positive" CHECK ("quantity">0),
  CONSTRAINT "OrderLine_money_nonnegative" CHECK ("unitPriceMinor">=0 AND "lineTotalMinor">=0)
);
CREATE INDEX "OrderLine_orderId_id_idx" ON "OrderLine"("orderId","id");
CREATE INDEX "OrderLine_variantId_idx" ON "OrderLine"("variantId");

CREATE TABLE "OrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "note" TEXT,
  "customerSafe" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderEvent_actorKind_check" CHECK ("actorKind" IN ('customer','guest','system','staff'))
);
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId","createdAt");

CREATE TABLE "DeliverySlotBooking" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DeliverySlotBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliverySlotBooking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliverySlotBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "DeliverySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliverySlotBooking_state_check" CHECK ("state" IN ('active','released'))
);
CREATE UNIQUE INDEX "DeliverySlotBooking_orderId_key" ON "DeliverySlotBooking"("orderId");
CREATE INDEX "DeliverySlotBooking_slotId_state_idx" ON "DeliverySlotBooking"("slotId","state");

CREATE TABLE "TrackingThrottle" (
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  CONSTRAINT "TrackingThrottle_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "TrackingThrottle_attempts_nonnegative" CHECK ("attempts">=0),
  CONSTRAINT "TrackingThrottle_key_hex" CHECK ("key" ~ '^[a-f0-9]{64}$')
);

CREATE OR REPLACE FUNCTION prevent_commerce_history_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commerce history is append-only';
END;
$$;
CREATE TRIGGER "OrderLine_immutable" BEFORE UPDATE OR DELETE ON "OrderLine" FOR EACH ROW EXECUTE FUNCTION prevent_commerce_history_rewrite();
CREATE TRIGGER "OrderDeliveryAddress_immutable" BEFORE UPDATE OR DELETE ON "OrderDeliveryAddress" FOR EACH ROW EXECUTE FUNCTION prevent_commerce_history_rewrite();
CREATE TRIGGER "OrderEvent_immutable" BEFORE UPDATE OR DELETE ON "OrderEvent" FOR EACH ROW EXECUTE FUNCTION prevent_commerce_history_rewrite();
