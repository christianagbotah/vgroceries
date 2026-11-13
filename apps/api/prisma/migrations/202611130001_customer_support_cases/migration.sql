-- Private, audited customer support handoff. No outbound SMS or calls.
CREATE TABLE "CustomerSupportCase" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "orderReference" TEXT,
  "preferredContact" TEXT NOT NULL DEFAULT 'phone',
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomerSupportCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerSupportCase_reference_key" ON "CustomerSupportCase"("reference");
CREATE INDEX "CustomerSupportCase_status_createdAt_idx" ON "CustomerSupportCase"("status","createdAt");
CREATE INDEX "CustomerSupportCase_createdAt_idx" ON "CustomerSupportCase"("createdAt");

CREATE TABLE "CustomerSupportActivity" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "privateNote" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSupportActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerSupportActivity_caseId_createdAt_idx" ON "CustomerSupportActivity"("caseId","createdAt");
ALTER TABLE "CustomerSupportActivity" ADD CONSTRAINT "CustomerSupportActivity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerSupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
