-- Reconcile the historical UAT branch lineage with the current production schema.
-- The superseded location fields were never populated in UAT; fail closed rather
-- than silently discarding data if another shared database did populate them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CustomerAddress"
    WHERE "latitude" IS NOT NULL OR "longitude" IS NOT NULL OR "locationSource" IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM "OrderDeliveryAddress"
    WHERE "latitude" IS NOT NULL OR "longitude" IS NOT NULL OR "locationSource" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile legacy location columns: populated location data exists.';
  END IF;
END $$;

-- Current identity authority stores missing non-customer phone values as the
-- schema default empty string while customer uniqueness applies only to nonempty
-- customer phones.
UPDATE "User" SET "phone" = '' WHERE "phone" IS NULL;
ALTER TABLE "User" ALTER COLUMN "phone" SET DEFAULT '';
ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL;

ALTER TABLE "CustomerAddress"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "locationSource";

ALTER TABLE "OrderDeliveryAddress"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "locationSource";
