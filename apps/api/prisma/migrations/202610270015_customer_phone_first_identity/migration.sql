ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Older UAT databases briefly carried a global phone uniqueness rule outside the
-- migration history. Remove either representation before installing the intended
-- customer-only identity constraint. These statements are no-ops on clean databases.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_phone_key";
DROP INDEX IF EXISTS "User_phone_key";

-- Canonicalize recognized legacy Ghana customer phone formats so existing
-- customers can use the new phone login immediately after deployment.
WITH normalized AS (
  SELECT id, regexp_replace(phone, '[[:space:]-]', '', 'g') AS compact
  FROM "User"
  WHERE role = 'customer' AND phone <> ''
)
UPDATE "User" AS users
SET phone = CASE
  WHEN normalized.compact ~ '^\+233[25][0-9]{8}$' THEN normalized.compact
  WHEN normalized.compact ~ '^233[25][0-9]{8}$' THEN '+' || normalized.compact
  WHEN normalized.compact ~ '^0[25][0-9]{8}$' THEN '+233' || substring(normalized.compact FROM 2)
  ELSE users.phone
END
FROM normalized
WHERE users.id = normalized.id;

CREATE UNIQUE INDEX "User_customer_phone_key"
ON "User" ("phone")
WHERE "role" = 'customer' AND "phone" <> '';
