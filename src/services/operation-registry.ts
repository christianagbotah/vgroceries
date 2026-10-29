/**
 * Operation registry — declarative metadata for every mock operation.
 *
 * Documents, in one place, how each operation participates in the boundary:
 *   - `tags`      : response families the READ touches (cache keys);
 *   - `invalidates`: families a successful MUTATION refreshes (the
 *                   `vg:cache-invalidated` contract from contracts/common.ts);
 *   - `idempotent`: operations whose retries are safe by design.
 *
 * The registry is what makes "cache refresh behaviour after stock, order,
 * payment and return changes" a contract rather than an accident: after
 * e.g. `admin.pos.complete`, the client adapter drops cached `catalog`,
 * `stock`, `orders`, `payments` and `sessions` reads and every mounted
 * screen can refetch. The full mock→REST endpoint mapping table lives in
 * docs/API_CONTRACTS.md.
 */

import type { CacheTag } from "./contracts/common";

export interface OperationMeta {
  tags?: CacheTag[];
  invalidates?: CacheTag[];
}

const CAT: CacheTag[] = ["catalog"];
const STOCK: CacheTag[] = ["stock"];
const ORD: CacheTag[] = ["orders"];
const PAY: CacheTag[] = ["payments"];
const RET: CacheTag[] = ["returns"];
const DEL: CacheTag[] = ["delivery"];
const SESS: CacheTag[] = ["sessions"];
const CONF: CacheTag[] = ["config"];
const LOGISTICS: CacheTag[] = ["logistics"];
const AI: CacheTag[] = ["ai"];
const MEDIA: CacheTag[] = ["product-media"];

export const operationMeta: Record<string, OperationMeta> = {
  /* identity */
  "auth.login": { invalidates: ["*"] },
  "auth.signup": { invalidates: ["*"] },
  "auth.me": {},

  /* catalogue (public) */
  "catalog.categories": { tags: CAT },
  "catalog.list": { tags: CAT },
  "catalog.product": { tags: CAT },
  "catalog.home": { tags: CAT },
  "catalog.by-variants": { tags: CAT },
  "content.homepage": { tags: CONF },
  "content.page": { tags: CONF },

  /* checkout (public) */
  "checkout.quote": { tags: [...CAT, ...CONF] },
  "checkout.complete": { invalidates: [...CAT, ...STOCK, ...ORD] },
  "payments.initiate": { invalidates: [...ORD, ...PAY] },
  "checkout.payment-outcome": { invalidates: [...ORD, ...PAY] },
  "checkout.status": { tags: ORD },
  "checkout.zones": { tags: CONF },
  "checkout.slots": { tags: CONF },
  "orders.track": { tags: [...ORD, ...DEL] },
  "orders.detail": { tags: ORD },

  /* account */
  "account.summary": { tags: [...ORD, ...RET] },
  "account.profile": { tags: ORD },
  "account.profile.update": { invalidates: ORD },
  "account.logout": { invalidates: ["*"] },
  "account.orders": { tags: ORD },
  "account.cancel": { invalidates: [...ORD, ...STOCK, ...CAT] },
  "account.return-lines": { tags: RET },
  "account.create-return": { invalidates: [...RET, ...ORD] },
  "account.returns": { tags: RET },
  "returns.detail": { tags: [...RET, ...PAY] },

  /* AI */
  "ai.assistant": { tags: [...CAT, ...AI] },
  "ai.budget-basket": { tags: [...CAT, ...AI] },
  "admin.ai.suggestions": { tags: AI },
  "admin.ai.generate": { invalidates: AI },
  "admin.ai.review": { invalidates: AI },
  "admin.ai.business-question": { tags: AI },

  /* staff: dashboard, orders, fulfilment */
  "admin.dashboard": { tags: [...ORD, ...STOCK, ...RET, ...DEL, ...SESS] },
  "admin.orders": { tags: ORD },
  "admin.order": { tags: [...ORD, ...RET, ...PAY, ...STOCK] },
  "admin.order.action": { invalidates: [...ORD, ...STOCK, ...CAT, ...DEL, ...PAY] },
  "admin.fulfilment": { tags: [...ORD, ...STOCK] },

  /* staff: POS */
  "admin.pos.search": { tags: [...CAT, ...STOCK] },
  "admin.pos.complete": { invalidates: [...CAT, ...STOCK, ...ORD, ...PAY, ...SESS] },
  "admin.pos.hold": { invalidates: STOCK },
  "admin.pos.drafts": { tags: STOCK },
  "admin.pos.resume": { tags: STOCK },
  "admin.pos.release-draft": { invalidates: [...STOCK, ...CAT] },
  "admin.pos.receipt-lookup": { tags: [...ORD, ...RET] },

  /* staff: cashier sessions */
  "admin.sessions": { tags: SESS },
  "admin.sessions.open": { invalidates: SESS },
  "admin.sessions.movement": { invalidates: SESS },
  "admin.sessions.close": { invalidates: [...SESS, ...PAY] },

  /* staff: inventory */
  "admin.inventory.overview": { tags: [...STOCK, ...CAT] },
  "admin.inventory.lots": { tags: STOCK },
  "admin.inventory.lot.quarantine": { invalidates: [...STOCK, ...CAT] },
  "admin.inventory.lot.dispose": { invalidates: [...STOCK, ...CAT] },
  "admin.inventory.receipts": { tags: [...STOCK] },
  "admin.inventory.receive": { invalidates: [...STOCK, ...CAT] },
  "admin.inventory.adjustments": { tags: STOCK },
  "admin.inventory.adjustments.create": { invalidates: STOCK },
  "admin.inventory.adjustments.decide": { invalidates: [...STOCK, ...CAT] },
  "admin.inventory.stocktakes": { tags: STOCK },
  "admin.inventory.stocktakes.open": { invalidates: STOCK },
  "admin.inventory.stocktakes.count": { invalidates: STOCK },
  "admin.inventory.stocktakes.close": { invalidates: [...STOCK, ...CAT] },
  "admin.inventory.expiry": { tags: STOCK },

  /* staff: catalogue admin */
  "admin.products": { tags: CAT },
  "admin.product": { tags: [...CAT, ...STOCK] },
  "admin.product.update": { invalidates: CAT },
  "admin.product.create": { invalidates: [...CAT, ...MEDIA] },
  "admin.product-media": { tags: [...CAT, ...MEDIA] },
  "admin.product-media.generation": { tags: MEDIA },
  "admin.product-media.upload": { invalidates: [...CAT, ...MEDIA] },
  "admin.product-media.generate": { invalidates: [...CAT, ...MEDIA] },
  "admin.product-media.approve": { invalidates: [...CAT, ...MEDIA] },
  "admin.product-media.reject": { invalidates: [...CAT, ...MEDIA] },
  "admin.product-media.archive": { invalidates: [...CAT, ...MEDIA] },
  "admin.product-media.featured": { invalidates: [...CAT, ...MEDIA] },
  "admin.product-media.reorder": { invalidates: [...CAT, ...MEDIA] },
  "admin.product-media.brand-mode": { invalidates: [...CAT, ...MEDIA] },
  "admin.variant.update": { invalidates: CAT },
  "admin.categories": { tags: CAT },
  "admin.categories.create": { invalidates: CAT },
  "admin.categories.update": { invalidates: CAT },

  /* staff: suppliers & purchasing */
  "admin.suppliers": { tags: STOCK },
  "admin.suppliers.update": { invalidates: STOCK },
  "admin.purchases": { tags: STOCK },
  "admin.purchases.create": { invalidates: STOCK },
  "admin.purchases.update": { invalidates: STOCK },
  "admin.purchases.send": { invalidates: STOCK },


  /* staff: logistics configuration (L1 only; no runtime shipment authority) */
  "admin.logistics.nodes": { tags: LOGISTICS },
  "admin.logistics.node": { tags: LOGISTICS },
  "admin.logistics.node.create": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.node.update": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.lanes": { tags: LOGISTICS },
  "admin.logistics.lane": { tags: LOGISTICS },
  "admin.logistics.lane.create": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.lane.update": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.workflows": { tags: LOGISTICS },
  "admin.logistics.workflow": { tags: LOGISTICS },
  "admin.logistics.workflow.create": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.workflow.draft": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.workflow.save": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.workflow.publish": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.route-rules": { tags: LOGISTICS },
  "admin.logistics.route-rule": { tags: LOGISTICS },
  "admin.logistics.route-rule.create": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.route-rule.update": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.route-rule.activate": { invalidates: [...LOGISTICS, ...CONF] },
  "admin.logistics.route-rule.simulate": { tags: LOGISTICS },

  /* staff: dispatch, riders, providers */
  "admin.dispatch.queue": { tags: [...DEL, ...ORD] },
  "admin.dispatch.assign": { invalidates: [...DEL, ...ORD] },
  "admin.dispatch.job.action": { invalidates: [...DEL, ...ORD, ...PAY, ...STOCK] },
  "admin.riders": { tags: [...DEL] },
  "admin.riders.toggle": { invalidates: DEL },
  "admin.providers": { tags: CONF },

  /* staff: returns, refunds, payments, customers */
  "admin.returns": { tags: [...RET, ...PAY] },
  "admin.return.action": { invalidates: [...RET, ...PAY, ...STOCK, ...CAT, ...ORD] },
  "admin.refunds": { tags: [...PAY, ...RET] },
  "admin.refund.action": { invalidates: [...PAY, ...RET, ...ORD] },
  "admin.payments": { tags: PAY },
  "admin.customers": { tags: ORD },
  "admin.customer": { tags: [...ORD, ...RET] },

  /* staff: reports, team, audit, settings */
  "admin.reports": { tags: [...ORD, ...STOCK, ...RET, ...PAY, ...DEL, ...SESS] },
  "admin.team": { tags: CONF },
  "admin.audit": { tags: ORD },
  "admin.content.overview": { tags: CONF },
  "admin.content.homepage": { tags: CONF },
  "admin.content.homepage.update": { invalidates: CONF },
  "admin.content.homepage.publish": { invalidates: CONF },
  "admin.content.page": { tags: CONF },
  "admin.content.page.update": { invalidates: CONF },
  "admin.content.page.publish": { invalidates: CONF },
  "admin.settings": { tags: CONF },
  "admin.settings.update": { invalidates: CONF },

  /* rider workspace */
  "rider.login": { tags: DEL },
  "rider.jobs": { tags: [...DEL, ...ORD] },
  "rider.job": { tags: [...DEL, ...ORD] },
  "rider.action": { invalidates: [...DEL, ...ORD, ...PAY, ...STOCK] },
  "rider.history": { tags: [...DEL, ...PAY] },

  /* demo controls (staff-only screens) */
  "demo.reset": { invalidates: ["*"] },
  "demo.flags": { invalidates: ["*"] },
  "demo.scenario": { invalidates: ["*"] },
};

/** Tags a READ touches (unknown ops default to no caching). */
export function readTags(op: string): CacheTag[] {
  return operationMeta[op]?.tags ?? [];
}

/** Families a successful MUTATION invalidates. */
export function invalidatesTags(op: string): CacheTag[] {
  return operationMeta[op]?.invalidates ?? [];
}
