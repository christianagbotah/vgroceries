-- Product Media Authority: reviewable product media, featured/gallery selection and queued AI generation.

ALTER TABLE "Product"
  ADD COLUMN "brandMode" TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN "featuredMediaId" TEXT;
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_brandMode_check" CHECK ("brandMode" IN ('auto','unbranded','branded'));
CREATE UNIQUE INDEX "Product_featuredMediaId_key" ON "Product"("featuredMediaId");

CREATE TABLE "ImageGenerationJob" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "stylePreset" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "requestSnapshot" JSONB NOT NULL,
  "referenceMediaId" TEXT,
  "candidateCount" INTEGER NOT NULL,
  "providerRequestId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageGenerationJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImageGenerationJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ImageGenerationJob_mode_check" CHECK ("mode" IN ('unbranded_generation','branded_packshot_edit')),
  CONSTRAINT "ImageGenerationJob_stylePreset_check" CHECK ("stylePreset" IN ('clean_studio','fresh_market','lifestyle_kitchen','ghana_market')),
  CONSTRAINT "ImageGenerationJob_status_check" CHECK ("status" IN ('queued','generating','succeeded','failed','cancelled')),
  CONSTRAINT "ImageGenerationJob_candidateCount_check" CHECK ("candidateCount" BETWEEN 1 AND 4),
  CONSTRAINT "ImageGenerationJob_attemptCount_check" CHECK ("attemptCount" BETWEEN 0 AND 3),
  CONSTRAINT "ImageGenerationJob_reference_check" CHECK ("mode" <> 'branded_packshot_edit' OR "referenceMediaId" IS NOT NULL)
);
CREATE INDEX "ImageGenerationJob_productId_createdAt_idx" ON "ImageGenerationJob"("productId","createdAt");
CREATE INDEX "ImageGenerationJob_status_createdAt_idx" ON "ImageGenerationJob"("status","createdAt");

CREATE TABLE "ProductMedia" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "storageKey" TEXT NOT NULL,
  "publicUrl" TEXT,
  "mimeType" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "altText" TEXT NOT NULL DEFAULT '',
  "galleryOrder" INTEGER,
  "originalFilename" TEXT,
  "generationJobId" TEXT,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectedAt" TIMESTAMPTZ(3),
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductMedia_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "ImageGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProductMedia_source_check" CHECK ("source" IN ('upload','ai_generated','ai_edited','legacy_import')),
  CONSTRAINT "ProductMedia_status_check" CHECK ("status" IN ('draft','ready_for_review','approved','rejected','archived')),
  CONSTRAINT "ProductMedia_mimeType_check" CHECK ("mimeType" IN ('image/jpeg','image/png','image/webp')),
  CONSTRAINT "ProductMedia_dimensions_check" CHECK ("width" BETWEEN 1 AND 6000 AND "height" BETWEEN 1 AND 6000),
  CONSTRAINT "ProductMedia_byteSize_check" CHECK ("byteSize" BETWEEN 1 AND 12582912),
  CONSTRAINT "ProductMedia_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ProductMedia_galleryOrder_check" CHECK ("galleryOrder" IS NULL OR "galleryOrder" >= 0),
  CONSTRAINT "ProductMedia_altText_check" CHECK (length("altText") <= 1000)
);
CREATE UNIQUE INDEX "ProductMedia_storageKey_key" ON "ProductMedia"("storageKey");
CREATE INDEX "ProductMedia_productId_status_galleryOrder_idx" ON "ProductMedia"("productId","status","galleryOrder");
CREATE INDEX "ProductMedia_generationJobId_idx" ON "ProductMedia"("generationJobId");
CREATE INDEX "ProductMedia_sha256_idx" ON "ProductMedia"("sha256");

ALTER TABLE "ImageGenerationJob"
  ADD CONSTRAINT "ImageGenerationJob_referenceMediaId_fkey" FOREIGN KEY ("referenceMediaId") REFERENCES "ProductMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_featuredMediaId_fkey" FOREIGN KEY ("featuredMediaId") REFERENCES "ProductMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
