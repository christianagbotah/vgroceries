-- Phone-first customer identity. Email remains unique when present but is no longer required.
UPDATE "User" SET "email" = NULL WHERE btrim(COALESCE("email", '')) = '';
UPDATE "User" SET "phone" = NULL WHERE btrim(COALESCE("phone", '')) = '';

-- Canonicalize common Ghana phone formats before the uniqueness constraint is added.
UPDATE "User"
SET "phone" = regexp_replace("phone", '[[:space:]-]', '', 'g')
WHERE "phone" IS NOT NULL;
UPDATE "User"
SET "phone" = '+233' || substring("phone" from 2)
WHERE "phone" ~ '^0[0-9]{9}$';
UPDATE "User"
SET "phone" = '+' || "phone"
WHERE "phone" ~ '^233[0-9]{9}$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User"
    WHERE "phone" IS NOT NULL
    GROUP BY "phone"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enable phone-first identity: duplicate normalized user phone numbers exist.';
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "phone" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
