-- Dispatch + Rider Authority. Fulfilment handover already consumed delivery stock.
CREATE TABLE "RiderProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "vehicle" TEXT NOT NULL,
  "availabilityState" TEXT NOT NULL DEFAULT 'offline',
  "lastAvailabilityChangedAt" TIMESTAMPTZ(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RiderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RiderProfile_kind_check" CHECK ("kind" IN ('in_house','contracted')),
  CONSTRAINT "RiderProfile_vehicle_check" CHECK ("vehicle" IN ('motorcycle','bicycle','car')),
  CONSTRAINT "RiderProfile_availability_check" CHECK ("availabilityState" IN ('available','offline')),
  CONSTRAINT "RiderProfile_phone_check" CHECK (length(btrim("phone")) BETWEEN 7 AND 32),
  CONSTRAINT "RiderProfile_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "RiderProfile_userId_key" ON "RiderProfile"("userId");
CREATE INDEX "RiderProfile_availabilityState_updatedAt_idx" ON "RiderProfile"("availabilityState","updatedAt");

CREATE TABLE "DeliveryJob" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "assignmentKind" TEXT NOT NULL,
  "riderProfileId" TEXT,
  "providerKey" TEXT,
  "providerNameSnapshot" TEXT,
  "manualProviderReference" TEXT,
  "status" TEXT NOT NULL,
  "custodyState" TEXT NOT NULL,
  "assignedBy" TEXT NOT NULL,
  "assignedAt" TIMESTAMPTZ(3) NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3),
  "pickedUpAt" TIMESTAMPTZ(3),
  "outForDeliveryAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "failureReasonCode" TEXT,
  "failureNote" TEXT,
  "rescheduledFor" TIMESTAMPTZ(3),
  "returnedToStoreAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryJob_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryJob_assignment_kind_check" CHECK ("assignmentKind" IN ('rider','manual_provider')),
  CONSTRAINT "DeliveryJob_assignment_target_check" CHECK (
    ("assignmentKind"='rider' AND "riderProfileId" IS NOT NULL AND "providerKey" IS NULL)
    OR ("assignmentKind"='manual_provider' AND "riderProfileId" IS NULL AND "providerKey" IS NOT NULL)
  ),
  CONSTRAINT "DeliveryJob_status_check" CHECK ("status" IN ('unassigned','assigned','accepted','picked_up','out_for_delivery','delivered','failed','rescheduled','return_to_store')),
  CONSTRAINT "DeliveryJob_custody_check" CHECK ("custodyState" IN ('dispatch','rider','provider','customer','return_pending','store_returned')),
  CONSTRAINT "DeliveryJob_failure_reason_check" CHECK ("failureReasonCode" IS NULL OR "failureReasonCode" IN ('customer_unavailable','customer_refused','address_problem','unable_to_contact','access_or_safety_issue','vehicle_or_operational_issue','other')),
  CONSTRAINT "DeliveryJob_failure_note_check" CHECK ("failureNote" IS NULL OR length(btrim("failureNote")) BETWEEN 1 AND 500),
  CONSTRAINT "DeliveryJob_provider_key_check" CHECK ("providerKey" IS NULL OR length(btrim("providerKey")) BETWEEN 1 AND 120),
  CONSTRAINT "DeliveryJob_provider_name_check" CHECK ("providerNameSnapshot" IS NULL OR length(btrim("providerNameSnapshot")) BETWEEN 1 AND 120),
  CONSTRAINT "DeliveryJob_provider_ref_check" CHECK ("manualProviderReference" IS NULL OR length(btrim("manualProviderReference")) BETWEEN 1 AND 200),
  CONSTRAINT "DeliveryJob_version_positive" CHECK ("version" > 0),
  CONSTRAINT "DeliveryJob_return_received_check" CHECK ("returnedToStoreAt" IS NULL OR "custodyState"='store_returned')
);
CREATE UNIQUE INDEX "DeliveryJob_orderId_key" ON "DeliveryJob"("orderId");
CREATE INDEX "DeliveryJob_status_updatedAt_idx" ON "DeliveryJob"("status","updatedAt");
CREATE INDEX "DeliveryJob_riderProfileId_status_updatedAt_idx" ON "DeliveryJob"("riderProfileId","status","updatedAt");
CREATE UNIQUE INDEX "DeliveryJob_one_active_per_rider" ON "DeliveryJob"("riderProfileId")
WHERE "riderProfileId" IS NOT NULL AND (
  "status" IN ('assigned','accepted','picked_up','out_for_delivery','failed','rescheduled')
  OR ("status"='return_to_store' AND "returnedToStoreAt" IS NULL)
);

CREATE TABLE "DeliveryEvent" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "note" TEXT,
  "safeMetadata" JSONB NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryEvent_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryEvent_actor_kind_check" CHECK ("actorKind" IN ('staff','rider','system')),
  CONSTRAINT "DeliveryEvent_note_check" CHECK ("note" IS NULL OR length(btrim("note")) BETWEEN 1 AND 500)
);
CREATE INDEX "DeliveryEvent_deliveryJobId_createdAt_idx" ON "DeliveryEvent"("deliveryJobId","createdAt");
CREATE INDEX "DeliveryEvent_orderId_createdAt_idx" ON "DeliveryEvent"("orderId","createdAt");

CREATE TABLE "DeliveryProof" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "recordedByKind" TEXT NOT NULL,
  "recordedById" TEXT,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryProof_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryProof_method_check" CHECK ("method" IN ('signature','photo_note')),
  CONSTRAINT "DeliveryProof_reference_check" CHECK ("reference" IS NULL OR length(btrim("reference")) BETWEEN 1 AND 200),
  CONSTRAINT "DeliveryProof_note_check" CHECK ("note" IS NULL OR length(btrim("note")) BETWEEN 1 AND 500),
  CONSTRAINT "DeliveryProof_actor_kind_check" CHECK ("recordedByKind" IN ('staff','rider','system'))
);
CREATE UNIQUE INDEX "DeliveryProof_deliveryJobId_key" ON "DeliveryProof"("deliveryJobId");

CREATE OR REPLACE FUNCTION prevent_delivery_ledger_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'delivery ledger history is append-only';
END;
$$;
CREATE TRIGGER "DeliveryEvent_append_only" BEFORE UPDATE OR DELETE ON "DeliveryEvent" FOR EACH ROW EXECUTE FUNCTION prevent_delivery_ledger_rewrite();
CREATE TRIGGER "DeliveryProof_append_only" BEFORE UPDATE OR DELETE ON "DeliveryProof" FOR EACH ROW EXECUTE FUNCTION prevent_delivery_ledger_rewrite();
