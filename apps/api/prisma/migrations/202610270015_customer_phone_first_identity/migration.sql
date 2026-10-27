ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Older UAT databases briefly carried a global phone uniqueness rule outside the
-- migration history. Remove either representation before installing the intended
-- customer-only identity constraint. These statements are no-ops on clean databases.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_phone_key";
DROP INDEX IF EXISTS "User_phone_key";

CREATE UNIQUE INDEX "User_customer_phone_key"
ON "User" ("phone")
WHERE "role" = 'customer' AND "phone" <> '';
