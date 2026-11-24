CREATE TABLE "BusinessProfile" (
  "id" TEXT PRIMARY KEY, "businessName" TEXT NOT NULL, "supportPhone" TEXT NOT NULL,
  "supportEmail" TEXT NOT NULL, "address" TEXT NOT NULL, "registrationNumber" TEXT NOT NULL,
  "operatingHours" TEXT NOT NULL, "receiptFooter" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessProfile_singleton" CHECK ("id" = 'main'),
  CONSTRAINT "BusinessProfile_version_check" CHECK ("version" > 0)
);
INSERT INTO "BusinessProfile" ("id","businessName","supportPhone","supportEmail","address","registrationNumber","operatingHours","receiptFooter")
VALUES ('main','Variety Groceries','','','','','','');
CREATE TABLE "DeliveryPartner" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "contactPhone" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL, "coverage" TEXT NOT NULL, "notes" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryPartner_version_check" CHECK ("version" > 0)
);
CREATE TABLE "IntegrationCredentialDraft" (
  "id" TEXT PRIMARY KEY, "ciphertext" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationCredentialDraft_version_check" CHECK ("version" > 0)
);
