import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";

const baseEnv = () => ({
  DATABASE_URL: "postgresql://lightworld@127.0.0.1:55432/variety_foundation_test",
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
});

test("shipment execution rollout defaults off and accepts only literal true or false", () => {
  assert.equal(readConfig(baseEnv()).shipmentExecutionEnabled, false);
  assert.equal(readConfig({ ...baseEnv(), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true" }).shipmentExecutionEnabled, true);
  assert.equal(readConfig({ ...baseEnv(), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "false" }).shipmentExecutionEnabled, false);

  for (const value of ["TRUE", "False", "1", "0", "yes", "", " enabled "]) {
    assert.throws(
      () => readConfig({ ...baseEnv(), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: value }),
      /LOGISTICS_SHIPMENT_EXECUTION_ENABLED must be true or false/,
      `expected ${JSON.stringify(value)} to be rejected`,
    );
  }
});


test("remote customer pickup requires an explicit independent opt-in and L2 activation", () => {
  assert.equal(readConfig(baseEnv()).customerPickupEnabled, false);
  assert.equal(readConfig({ ...baseEnv(), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true" }).customerPickupEnabled, false);
  assert.equal(readConfig({ ...baseEnv(), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true", LOGISTICS_CUSTOMER_PICKUP_ENABLED: "true" }).customerPickupEnabled, true);
  assert.throws(() => readConfig({ ...baseEnv(), LOGISTICS_CUSTOMER_PICKUP_ENABLED: "true" }), /requires shipment execution/);
  for (const value of ["yes", "1", "TRUE", "", "disabled"]) {
    assert.throws(() => readConfig({ ...baseEnv(), LOGISTICS_CUSTOMER_PICKUP_ENABLED: value }),
      /LOGISTICS_CUSTOMER_PICKUP_ENABLED must be true or false/);
  }
});
