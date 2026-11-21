/* Compatibility import for the existing web application. */
export * from "../../../packages/contracts/src/endpoints";

import {
  restEndpoints as sharedRestEndpoints,
  type RestEndpoint,
} from "../../../packages/contracts/src/endpoints";

/**
 * Web operations that have a production authority but are newer than the
 * generated/shared endpoint catalogue. Keeping this additive prevents a real
 * staff session from falling back to the mock operation protocol.
 */
export const restEndpoints: Record<string, RestEndpoint> = {
  ...sharedRestEndpoints,
  "orders.track-otp.request": { method: "POST", path: "/orders/track-otp/request" },
  "orders.track-otp.verify": { method: "POST", path: "/orders/track-otp/verify" },
  "account.phone-otp.request": { method: "POST", path: "/account/phone-otp/request" },
  "account.phone-otp.verify": { method: "POST", path: "/account/phone-otp/verify" },
  "admin.categories.create": { method: "POST", path: "/admin/categories" },
  // Administrator-only UAT preview; no stock reservation or payment action.
  "pos.verified.tills": { method: "GET", path: "/admin/pos/tills" },
  "pos.verified.quote": { method: "POST", path: "/admin/pos/quote" },
};
