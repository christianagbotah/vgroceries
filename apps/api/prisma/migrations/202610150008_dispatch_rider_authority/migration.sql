-- Dispatch + Rider Authority: durable assignment, custody and provider connectivity.
-- Financial collection/remittance is deliberately excluded from this authority.

CREATE TABLE "RiderProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "vehicle" TEXT,
  "zones" TEXT[] NOT NULL,
  "isAvailable" BOOLEAN NOT NULL DEFAULT false,
  "unavailableReason" TEXT,
  "lastLocationAt" TIMESTAMPTZ(3),
  "lastLocationLabel" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RiderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RiderProfile_kind_check" CHECK ("kind" IN ('in_house','partner')),
  CONSTRAINT "RiderProfile_phone_check" CHECK (length(trim("phone")) BETWEEN 7 AND 32)
);
CREATE UNIQUE INDEX "RiderProfile_userId_key" ON "RiderProfile"("userId");
CREATE INDEX "RiderProfile_isAvailable_idx" ON "RiderProfile"("isAvailable");

CREATE TABLE "DeliveryProvider" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capabilities" TEXT[] NOT NULL,
  "status" TEXT NOT NULL,
  "notes" TEXT,
  "isConfigured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryProvider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryProvider_id_check" CHECK ("id" ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  CONSTRAINT "DeliveryProvider_status_check" CHECK ("status" IN ('connected','degraded','not_connected','disabled')),
  CONSTRAINT "DeliveryProvider_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 160)
);

CREATE TABLE "DeliveryJob" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "assignmentKind" TEXT NOT NULL,
  "riderUserId" TEXT,
  "providerId" TEXT,
  "manualAssignee" TEXT,
  "status" TEXT NOT NULL DEFAULT 'assigned',
  "instructions" TEXT,
  "failureReason" TEXT,
  "rescheduledFor" TIMESTAMPTZ(3),
  "proofMethod" TEXT,
  "proofDetail" TEXT,
  "proofAt" TIMESTAMPTZ(3),
  "assignedAt" TIMESTAMPTZ(3),
  "acceptedAt" TIMESTAMPTZ(3),
  "pickedUpAt" TIMESTAMPTZ(3),
  "outForDeliveryAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "returnedToStoreAt" TIMESTAMPTZ(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryJob_riderUserId_fkey" FOREIGN KEY ("riderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryJob_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "DeliveryProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryJob_assignmentKind_check" CHECK ("assignmentKind" IN ('rider','provider','manual')),
  CONSTRAINT "DeliveryJob_assignment_target_check" CHECK (
    ("assignmentKind" = 'rider' AND "riderUserId" IS NOT NULL AND "providerId" IS NULL AND "manualAssignee" IS NULL) OR
    ("assignmentKind" = 'provider' AND "riderUserId" IS NULL AND "providerId" IS NOT NULL AND "manualAssignee" IS NULL) OR
    ("assignmentKind" = 'manual' AND "riderUserId" IS NULL AND "providerId" IS NULL AND length(trim(COALESCE("manualAssignee", ''))) > 0)
  ),
  CONSTRAINT "DeliveryJob_status_check" CHECK ("status" IN ('assigned','accepted','picked_up','out_for_delivery','delivered','failed','rescheduled','returned_to_store','unassigned')),
  CONSTRAINT "DeliveryJob_proof_method_check" CHECK ("proofMethod" IS NULL OR "proofMethod" IN ('pin','signature','photo_note')),
  CONSTRAINT "DeliveryJob_proof_consistency_check" CHECK (("proofMethod" IS NULL AND "proofAt" IS NULL) OR ("proofMethod" IS NOT NULL AND "proofAt" IS NOT NULL)),
  CONSTRAINT "DeliveryJob_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "DeliveryJob_orderId_key" ON "DeliveryJob"("orderId");
CREATE INDEX "DeliveryJob_riderUserId_status_idx" ON "DeliveryJob"("riderUserId","status");
CREATE INDEX "DeliveryJob_status_createdAt_idx" ON "DeliveryJob"("status","createdAt");

CREATE TABLE "DeliveryJobEvent" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorKind" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryJobEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryJobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryJobEvent_actorKind_check" CHECK ("actorKind" IN ('staff','rider','system','provider')),
  CONSTRAINT "DeliveryJobEvent_action_check" CHECK ("action" IN ('assigned','unassigned','reassigned','accepted','picked_up','out_for_delivery','delivered','failed','rescheduled','returned_to_store','note','availability_changed')),
  CONSTRAINT "DeliveryJobEvent_note_check" CHECK ("note" IS NULL OR length("note") <= 2000)
);
CREATE INDEX "DeliveryJobEvent_jobId_createdAt_idx" ON "DeliveryJobEvent"("jobId","createdAt");

CREATE OR REPLACE FUNCTION prevent_delivery_job_event_rewrite()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'delivery custody history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DeliveryJobEvent_append_only_update"
BEFORE UPDATE ON "DeliveryJobEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_delivery_job_event_rewrite();

CREATE TRIGGER "DeliveryJobEvent_append_only_delete"
BEFORE DELETE ON "DeliveryJobEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_delivery_job_event_rewrite();
