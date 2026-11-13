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
  "admin.categories.create": { method: "POST", path: "/admin/categories" },
  // Authenticated cash-report GETs; the API owns role and location filtering.
  "support.create": { method: "POST", path: "/support/requests" },
  "admin.support.list": { method: "GET", path: "/admin/support" },
  "admin.support.action": { method: "POST", path: "/admin/support/{caseId}/actions" },
  "pos.tills.list": { method: "GET", path: "/admin/pos/tills" },
  "pos.tills.reconciliation": { method: "GET", path: "/admin/pos/tills/{sessionId}/reconciliation" },
};
