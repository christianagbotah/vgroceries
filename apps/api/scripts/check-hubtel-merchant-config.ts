/**
 * Offline Hubtel configuration preflight. Validates only the locally provided
 * environment variables; it NEVER contacts Hubtel or prints credential values.
 *
 * Usage after deploying this source to the API server:
 *   node --env-file=/home/lightworld/config/varietygroceries/api.env \
 *     dist/scripts/check-hubtel-merchant-config.js
 */
import { readConfig } from "../src/config";

try {
  const config = readConfig();
  const readySales = config.hubtelSales !== null;
  const readySms = config.hubtelSms !== null;
  process.stdout.write(
    `Hubtel Sales credentials: ${readySales ? "configured" : "missing"}\n` +
    `Hubtel SMS credentials: ${readySms ? "configured" : "missing"}\n` +
    "Live financial transactions: not tested or activated by this preflight\n",
  );
  if (!readySales || !readySms) process.exitCode = 1;
} catch {
  // Never output raw .env data or sensitive provider responses.
  process.stderr.write("Hubtel configuration validation failed. Check the required environment variable names and values privately.\n");
  process.exitCode = 1;
}
