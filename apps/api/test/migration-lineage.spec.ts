import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const migrationsRoot = path.resolve(process.cwd(), "prisma/migrations");

const deployedUatLineage = [
  "202610240014_phone_first_customer_identity",
  "202610240015_location_first_delivery_address",
];

const reconciliationMigration = "202610280018_reconcile_uat_migration_lineage";

test("source control retains deployed UAT migration lineage and a forward reconciliation", async () => {
  for (const migration of deployedUatLineage) {
    await access(path.join(migrationsRoot, migration, "migration.sql"));
  }

  const reconciliation = await readFile(
    path.join(migrationsRoot, reconciliationMigration, "migration.sql"),
    "utf8",
  );
  assert.match(reconciliation, /ALTER COLUMN "phone" SET NOT NULL/);
  assert.match(reconciliation, /ALTER COLUMN "phone" SET DEFAULT ''/);
  assert.match(reconciliation, /DROP COLUMN IF EXISTS "latitude"/);
  assert.match(reconciliation, /DROP COLUMN IF EXISTS "longitude"/);
  assert.match(reconciliation, /DROP COLUMN IF EXISTS "locationSource"/);
});
