/* Compatibility import for the existing web application. */
import { restEndpoints as sharedRestEndpoints, type RestEndpoint } from "../../../packages/contracts/src/endpoints";
import { operationMeta } from "../operation-registry";

export * from "../../../packages/contracts/src/endpoints";

/**
 * Wave L2 adds one customer-safe read before the shared endpoint registry is
 * regenerated as a whole. Keep the web adapter explicit and cache-aware so
 * no screen falls back to an unregistered/raw fetch.
 */
export const restEndpoints: Record<string, RestEndpoint> = {
  ...sharedRestEndpoints,
  "checkout.pickup-options": { method: "GET", path: "/checkout/pickup-options" },
};

operationMeta["checkout.pickup-options"] = { tags: ["config", "logistics"] };
