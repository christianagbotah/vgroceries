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
  "admin.verified.fulfilment.queue": {method:"GET",path:"/admin/fulfilment"},
  "admin.verified.fulfilment.detail": {method:"GET",path:"/admin/fulfilment/orders/{orderId}"},
  "admin.verified.fulfilment.pick": {method:"PUT",path:"/admin/fulfilment/orders/{orderId}/picks/{reservationId}",replayTransport:"headerOnly"},
  "admin.verified.fulfilment.confirm": {method:"POST",path:"/admin/fulfilment/orders/{orderId}/confirm",replayTransport:"headerOnly"},
  "admin.verified.fulfilment.start-picking": {method:"POST",path:"/admin/fulfilment/orders/{orderId}/start-picking",replayTransport:"headerOnly"},
  "admin.verified.fulfilment.pack": {method:"POST",path:"/admin/fulfilment/orders/{orderId}/pack",replayTransport:"headerOnly"},
  "admin.verified.fulfilment.handover": {method:"POST",path:"/admin/fulfilment/orders/{orderId}/handover",replayTransport:"headerOnly"},
  "admin.verified.dispatch.fleet": {method:"GET",path:"/admin/riders"},
  "admin.verified.dispatch.unassign": {method:"POST",path:"/admin/dispatch/jobs/{jobId}/unassign",replayTransport:"headerOnly"},
  "admin.verified.dispatch.reschedule": {method:"POST",path:"/admin/dispatch/jobs/{jobId}/reschedule",replayTransport:"headerOnly"},
  "admin.verified.dispatch.return": {method:"POST",path:"/admin/dispatch/jobs/{jobId}/return-to-store",replayTransport:"headerOnly"},
  "admin.verified.dispatch.receive": {method:"POST",path:"/admin/dispatch/jobs/{jobId}/returned-to-store",replayTransport:"headerOnly"},
  "admin.verified.dispatch.transition": {method:"POST",path:"/admin/dispatch/jobs/{jobId}/provider-transition",replayTransport:"headerOnly"},
  "admin.directory.dispatch.queue": {method:"GET",path:"/admin/dispatch"},
  "admin.directory.dispatch.assign": {method:"POST",path:"/admin/dispatch/orders/{orderId}/assign",replayTransport:"headerOnly"},
  "admin.directory.dispatch.reassign": {method:"POST",path:"/admin/dispatch/jobs/{jobId}/reassign",replayTransport:"headerOnly"},
  "content.business-identity": { method: "GET", path: "/content/business-identity" },
  "content.business-contact": { method: "GET", path: "/content/business-contact" },
  "admin.business.profile": { method: "GET", path: "/admin/settings/business" },
  "admin.business.save": { method: "POST", path: "/admin/settings/business/update" },
  "admin.delivery.partners": { method: "GET", path: "/admin/delivery-providers" },
  "admin.delivery.partner.create": { method: "POST", path: "/admin/delivery-providers" },
  "admin.delivery.partner.update": { method: "POST", path: "/admin/delivery-providers/{id}/update" },
  "admin.integration.credentials": { method: "GET", path: "/admin/integrations/credentials" },
  "admin.integration.draft.save": { method: "POST", path: "/admin/integrations/credentials/{id}/draft" },
  "orders.track-otp.request": { method: "POST", path: "/orders/track-otp/request" },
  "orders.track-otp.verify": { method: "POST", path: "/orders/track-otp/verify" },
  "account.phone-otp.request": { method: "POST", path: "/account/phone-otp/request" },
  "account.phone-otp.verify": { method: "POST", path: "/account/phone-otp/verify" },
  "admin.categories.create": { method: "POST", path: "/admin/categories" },
  // Administrator-only UAT preview; no stock reservation or payment action.
  "pos.verified.tills": { method: "GET", path: "/admin/pos/tills" },
  "pos.verified.till.open": {method:"POST",path:"/admin/pos/tills",replayTransport:"headerOnly"},
  "pos.verified.till.move": {method:"POST",path:"/admin/pos/tills/{sessionId}/movements",replayTransport:"headerOnly"},
  "pos.verified.till.close": {method:"POST",path:"/admin/pos/tills/{sessionId}/close",replayTransport:"headerOnly"},
  "pos.verified.quote": { method: "POST", path: "/admin/pos/quote" },
  "pos.verified.cash-sales": { method: "GET", path: "/admin/pos/cash-sales" },
  "pos.verified.cash-sales-page": { method: "GET", path: "/admin/pos/cash-sales/history" },
  "pos.verified.reconciliation": { method: "GET", path: "/admin/pos/tills/{sessionId}/reconciliation" },
};
