/** Authenticated, screen-by-screen training catalogue. This describes UI screens,
 * not permissions to perform server mutations. Never derive a real role from
 * a URL, query parameter, demo role selector, or browser storage.
 */
export type ManualRole = "admin" | "inventory_manager" | "cashier" | "rider" | "customer";
export type ManualAudience = "admin" | "inventory" | "cashier" | "rider" | "customer" | "shared";
export type ManualReadiness = "preview" | "gated" | "implemented" | "pending" | "staging" | "absent";

export interface ManualScreen {
  path: string;
  title: string;
  audience: ManualAudience;
  section: string;
  readiness: ManualReadiness;
  purpose: string;
  action: string;
  check: string;
  /** External draft source; not a page in this checkout and not a live-route claim. */
  releaseSource?: string;
}
/** One entry for every screen currently present in src/app (except the manual itself).
 * Each row is path, title, audience, section, readiness, purpose, action, checkpoint.
 * "preview" means the page exists, NOT that backend finance/stock is live.
 * "gated" indicates a dedicated real-API feature flag or UAT gate is involved.
 */
const rows: readonly [string,string,ManualAudience,string,ManualReadiness,string,string,string][] = [
  ["/","Storefront home","customer","Shop & discover","preview","Browse featured groceries, offers, categories and shop entry points.","Choose a department or search for a product.","Product imagery, availability and offers require published catalogue review."],
  ["/shop","All groceries","customer","Shop & discover","preview","Browse and filter the grocery catalogue.","Search, choose a category, inspect an item and its unit.","A displayed item is not a guaranteed reservation."],
  ["/categories","Categories","customer","Shop & discover","preview","Browse grocery departments.","Open a category tile to view its product list.","Only verified, published products should be offered."],
  ["/categories/[slug]","Category products","customer","Shop & discover","preview","View products in one department.","Review pack sizes and product cards; open product details.","Stock must be checked again at checkout."],
  ["/products/[slug]","Product details","customer","Shop & discover","preview","Review a product, variants, image, quantity and price.","Choose a variant and add a suitable quantity to the basket.","Product descriptions and allergen details must come from verified sources."],
  ["/cart","Shopping basket","customer","Checkout","preview","Review selected products before checkout.","Adjust quantities, remove items and proceed to checkout.","Basket contents are not reserved stock."],
  ["/checkout","Checkout","customer","Checkout","gated","Choose delivery or pickup, confirm the authoritative quote and initiate payment.","Confirm contact, address/collection point and method; submit once.","Never treat a redirect or provider HTTP 200 as verified settlement."],
  ["/checkout/payment-return","Payment provider return","customer","Checkout","gated","Display the provider-return checkpoint after hosted checkout.","Follow the status link to verify the server's latest recorded outcome.","A browser return is not proof that money was captured."],
  ["/checkout/status/[id]","Checkout status","customer","Checkout","gated","Track a specific checkout/order verification state.","Refresh status and follow the verified order reference.","An unresolved provider state must not be labelled paid."],
  ["/track","Track an order","customer","Orders & delivery","preview","Track a legitimate order using its reference and verification proof.","Enter required verification details and inspect milestones.","Location and ETA must be supported by real delivery evidence."],
  ["/delivery","Delivery options","customer","Orders & delivery","preview","Understand service areas, fulfilment and pickup options.","Review zones and any displayed fees or pickup instructions.","Actual coverage and operating hours need launch validation."],
  ["/delivery-report","Delivery report","customer","Orders & delivery","preview","View delivery-related information exposed in the storefront.","Inspect available delivery breakdowns.","Report content is not a verified rider cash receipt."],
  ["/account/login","Customer sign in","customer","Account & support","implemented","Access a customer account using registered credentials.","Sign in with phone or email and password.","Never share one-time codes or passwords with support agents."],
  ["/account/signup","Create an account","customer","Account & support","implemented","Register a customer account.","Provide real contact details and a strong password.","Registration is separate from confirming a successful purchase."],
  ["/account","My account","customer","Account & support","implemented","See account summary, recent orders and shortcuts.","Open recent orders, addresses and profile.","Information is scoped to the signed-in customer."],
  ["/account/profile","My profile","customer","Account & support","implemented","Review and update customer contact information.","Edit supported fields and save; confirm changes.","Correct phone and address details are essential for delivery."],
  ["/account/addresses","Saved addresses","customer","Account & support","preview","Manage saved delivery destinations.","Add or edit an address and check landmarks before checkout.","Saving an address does not book a delivery slot."],
  ["/account/lists","Saved lists","customer","Account & support","preview","Keep preferred shopping items for later.","Review and update favourite or repeat-shopping lists.","Reordering still requires fresh stock and price verification."],
  ["/account/notifications","Notifications","customer","Account & support","gated","Read customer-owned in-app updates.","Review unread items and open linked orders.","In-app notices do not prove that an SMS/email was delivered."],
  ["/account/orders","My orders","customer","Orders & delivery","implemented","Review customer-owned order history and statuses.","Open an order for the current recorded payment and fulfilment state.","Payment, packing and delivery are independent statuses."],
  ["/account/orders/[id]","Order details","customer","Orders & delivery","implemented","Inspect the lines, prices and progress of a particular order.","Check payment verification, fulfilment and eligible next actions.","Cancellation and return eligibility are controlled by the backend."],
  ["/account/returns","My return requests","customer","Returns","gated","See a customer's submitted return claims and their state.","Review a claim and any requested next step.","Acceptance does not itself mean cash refunded or goods restocked."],
  ["/account/returns/[id]","Return request detail","customer","Returns","gated","Read an individual return request, linked order and progress.","Review quantities, decisions and physical receipt evidence.","No refund should be promised before financial verification."],
  ["/assistant","Shopping assistant","customer","Shop & discover","preview","Explore AI-assisted product suggestions.","Ask about groceries or a budget and confirm suggested items.","AI output must not invent stock, nutrition, discounts or health claims."],
  ["/help","Help centre","shared","Guidance & policies","implemented","Find common support guidance and links to operational information.","Open the relevant help topic or full user manual.","Public policy text must match approved business rules."],
  ["/privacy","Privacy policy","shared","Guidance & policies","preview","Review customer-data and privacy terms.","Read the published policy before sharing personal information.","Final legal wording needs business approval."],
  ["/terms","Terms and conditions","shared","Guidance & policies","preview","Review commercial and platform terms.","Check terms applicable to current order and service.","Operational terms require final legal approval."],
  ["/returns-policy","Returns policy","shared","Guidance & policies","preview","Read the published customer returns guidance.","Check eligible cases and required evidence.","Published guidance does not override refund authorization."],
  ["/forgot-password","Forgot password","shared","Identity & security","implemented","Start a secure password recovery flow.","Provide the registered account identity and follow verified instructions.","Do not disclose a reset token to another person."],
  ["/reset-password","Reset password","shared","Identity & security","implemented","Complete a recovery flow using the authorized reset link.","Set a new strong password and sign in again.","An expired or used token must be rejected."],

  ["/admin","Operations dashboard","admin","Administration","preview","See summarized orders, revenue and operational indicators.","Review alerts then open a source report before acting.","Dashboard figures must be reconciled against source records."],
  ["/admin/orders","All orders","admin","Orders & fulfilment","preview","Filter and review order queues, channels and payment states.","Find an order and inspect full detail before taking an action.","Unverified provider outcomes are not captured payments."],
  ["/admin/orders/[id]","Order administration","admin","Orders & fulfilment","gated","Inspect a server-owned order and its fulfilment decisions.","Review lines, verification, dispatch and permitted actions.","Use the correct owner and preserve immutable history."],
  ["/admin/fulfilment","Picking and packing","admin","Orders & fulfilment","gated","Manage eligible picking, packing and handover stages.","Open a verified order, check reserved lines and record approved steps.","Do not deduct stock a second time after authorized depletion."],
  ["/admin/pos","Counter sales / POS","admin","Counter sales","preview","Inspect POS workspace and the current demo/cashier workflows.","Check role, till identity and availability before entering a sale.","A demo preview is not permission to capture physical cash."],
  ["/admin/pos/verified-uat","Verified POS UAT","admin","Counter sales","gated","Review real-API quote and stock-check previews under separate flags.","Verify quote, open-till selection and strict server response.","Quoting does not reserve stock, collect money or hand over goods."],
  ["/admin/cashier-sessions","Cashier sessions","admin","Counter sales","gated","Review till opening floats, movements and closing status.","Check reconciliation and authorized drawer activity.","Till discrepancy and electronic settlement must not be conflated."],
  ["/admin/content","Content studio","admin","Content & catalogue","gated","Manage draft and published website content.","Select a page, edit the draft and publish only after review.","Publishing can change public policy text immediately."],
  ["/admin/content/homepage","Homepage content","admin","Content & catalogue","gated","Edit hero, banners and supported storefront homepage sections.","Preview the draft before publication.","Use approved brand assets and verified campaign claims."],
  ["/admin/content/pages/[slug]","Content page editor","admin","Content & catalogue","gated","Edit policy/help pages in the CMS.","Review the page draft and publish reviewed copy.","Privacy, returns and terms require final business sign-off."],
  ["/admin/products","Product catalogue","admin","Content & catalogue","preview","Review items, variants, publication and media.","Search a product and inspect its pricing and availability.","Supplier facts, pack sizes and photos need verification."],
  ["/admin/products/[id]","Product editor","admin","Content & catalogue","preview","Manage individual product details, images, variants and settings.","Review the correct SKU and save permitted changes.","Do not invent nutrition or substitute an unverified image."],
  ["/admin/categories","Category management","admin","Content & catalogue","preview","Maintain shopping department structure.","Inspect the category hierarchy and its product placement.","Changing categories can affect storefront navigation."],
  ["/admin/inventory","Inventory overview","inventory","Inventory","gated","Review stock by location, reservations and sellable balance.","Filter branch/product and inspect stock evidence.","Available-to-sell stock excludes reservations and safety stock."],
  ["/admin/inventory/receiving","Goods receiving","inventory","Inventory","gated","Record verified physical receipts to stock.","Check supplier/product, lot, quantity and expiry before posting.","A purchase order alone is not physical stock receipt."],
  ["/admin/inventory/adjustments","Inventory adjustments","inventory","Inventory","gated","Request or review audited stock corrections.","Specify lot, quantity, reason and required approval.","A draft adjustment must not change stock before authorization."],
  ["/admin/inventory/stocktakes","Stocktakes","inventory","Inventory","preview","Compare counted stock with system quantity.","Select a stocktake and record physical counting evidence.","Variance must be approved before stock correction."],
  ["/admin/inventory/expiry","Expiry and quarantine","inventory","Inventory","preview","Review damaged, expired and quarantined stock.","Inspect lot condition and any quarantine action.","Quarantined or expired stock cannot be sold."],
  ["/admin/suppliers","Suppliers","inventory","Purchasing","preview","Maintain approved supplier contact and trading details.","Find a supplier and review its current details.","Supplier records do not independently prove inventory."],
  ["/admin/purchases","Purchase orders","inventory","Purchasing","preview","Create and review purchasing documents.","Review selected line quantities, unit prices and totals.","A purchase order preview is not a stock movement."],
  ["/admin/logistics","Logistics network","admin","Delivery operations","gated","Configure fulfilment nodes, routes and operational policies.","Review workflow versions and simulate before activation.","Route planning is not proof of dispatch or arrival."],
  ["/admin/logistics/shipments","Shipment execution","admin","Delivery operations","gated","Review shipment plans and custody checkpoints.","Open a shipment and inspect real movement evidence.","No GPS/ETA or arrival should be invented."],
  ["/admin/dispatch","Dispatch queue","admin","Delivery operations","gated","Review orders ready for delivery assignment and progress.","Select an eligible order and assigned rider/provider.","Delivery is not proof of COD settlement."],
  ["/admin/dispatch/cod-exceptions","COD exceptions","admin","Delivery operations","gated","Review unpaid-cash exceptions and independent counting evidence.","Trace rider declaration, supervisor checks and discrepancy.","Do not mark cash remitted until independently reconciled."],
  ["/admin/riders","Rider management","admin","Delivery operations","preview","Manage rider profiles and assignments.","Verify active rider and location grants.","Avoid giving riders unrelated customer/finance data."],
  ["/admin/providers","Delivery providers","admin","Delivery operations","preview","Review courier/provider configuration and availability.","Check provider scope and supported services.","Live courier integrations require credentialed acceptance."],
  ["/admin/returns","Returns queue","admin","Returns & refunds","gated","Review return cases and their approval state.","Inspect the original order and eligible lines.","A delivery return is not by itself a restock or refund."],
  ["/admin/returns/[id]","Return case","admin","Returns & refunds","gated","Inspect a particular return and its evidence.","Review quantities and inspection before decisions.","Do not return spoiled goods to sellable stock."],
  ["/admin/return-claims","Customer return claims","admin","Returns & refunds","gated","Review submitted customer claims and decisions.","Verify original order, requested quantities and claim status.","An accepted claim is not physical inspection or refund."],
  ["/admin/physical-returns","Physical return intake","admin","Returns & refunds","gated","Record goods physically received and inspected.","Check original lot, quantity, evidence and quarantine outcome.","Restocking requires separate inspected authorization."],
  ["/admin/refunds","Refund authority","admin","Returns & refunds","gated","Review and authorize eligible refund obligations.","Check payment proof, amount and approval requirements.","A refund request is not a provider-confirmed refund."],
  ["/admin/customers","Customer administration","admin","Customer service","preview","Find supported customer records and contact details.","Use permitted search to open a legitimate support case.","Respect least-privilege access to personal data."],
  ["/admin/payments","Payment ledger","admin","Finance & reporting","gated","Review verified provider payment attempts and reconciliation.","Inspect transaction reference and provider evidence.","Payment success must be independently verified."],
  ["/admin/reports","Reports","admin","Finance & reporting","preview","Review available operational and financial reports.","Set the reporting interval and cross-check source ledgers.","Reports are not independently audited statements."],
  ["/admin/ai","Staff AI assistant","admin","Finance & reporting","preview","Explore assistive insights for operations.","Use AI explanations as decision support only.","AI cannot create verified stock or payment authority."],
  ["/admin/team","Team and roles","admin","Administration","preview","Manage staff identities, roles and permissions.","Review each person's branch and task scope.","Only the server can enforce access, regardless of menu visibility."],
  ["/admin/team/verified","Verified staff UAT","admin","Administration","gated","Review real cashier invitations and secure role assignments.","Check branch grants and invitation activation.","Do not assume a demo user has production authority."],
  ["/admin/audit","Audit log","admin","Administration","preview","Trace activity and operational changes.","Filter a source record and inspect actor/time evidence.","An audit entry must be immutable and access-controlled."],
  ["/admin/settings","System settings","admin","Administration","preview","Manage business, storefront and integration settings.","Inspect and validate configuration before saving.","Payment and SMS secrets must not be exposed in the manual."],
  ["/admin/demo","Demo controls","admin","Administration","preview","Use illustrative datasets for UAT training.","Reset or explore non-production examples.","Demo activity is not a real sale, inventory or payment."],

  ["/staff/login","Staff sign in","shared","Identity & security","implemented","Sign into an authorized staff account.","Use the assigned identity and password.","Real roles are determined by the server, not by a demo selector."],
  ["/staff/activate","Cashier invitation activation","cashier","Cashier workspace","gated","Accept an administrator-issued staff invitation.","Validate the invite and create credentials.","An invitation alone is not permission to sell stock."],
  ["/staff/cashier/workspace","My cashier workspace","cashier","Cashier workspace","gated","Inspect assigned branches, tills and own recent sales.","Sign in with a real cashier account, then refresh records.","This page is read-only; it cannot collect cash or change inventory."],
  ["/staff/rider/login","Verified rider sign in","rider","Rider workspace","gated","Sign in to the server-verified rider area.","Use an assigned rider account and confirm your branch.","A legacy demo rider ID is not production authentication."],
  ["/staff/rider/cod","Rider COD declaration","rider","Rider workspace","gated","Declare physically collected COD money against eligible delivered jobs.","Confirm counted cash and possession with an evidence note.","A rider declaration is not supervisor acceptance or bank remittance."],
  ["/rider/login","Rider demo sign in","rider","Rider demo","preview","Open the legacy demonstration rider experience.","Choose the demo identity to explore sample jobs.","No real rider payment, location or settlement is recorded."],
  ["/rider","Today's rider jobs","rider","Rider demo","preview","View assigned example deliveries and their stage.","Open a job, review destination and delivery instructions.","Legacy rider screens may contain illustrative data only."],
  ["/rider/jobs/[id]","Rider job detail","rider","Rider demo","preview","Inspect a rider delivery job and available demo actions.","Review assigned items and contact information before action.","Do not represent a demo completion as real delivery proof."],
  ["/rider/history","Rider job history","rider","Rider demo","preview","Review previous example deliveries.","Open a completed or failed example job for context.","Demo history is not a cash or settlement ledger."],
];

/** Compared on 20 Nov 2026 against built pages in the active POS portal
 * release varietygroceries-portal-hubtel-safe-107fc4f-20261117.
 * These paths exist in the reviewed source but NOT in that deployed build.
 */
export const MANUAL_SOURCE_ONLY_PATHS=[
  "/admin/dispatch/cod-exceptions",
  "/admin/team/verified",
  "/staff/cashier/workspace",
  "/staff/rider/cod",
  "/staff/rider/login",
] as const;
const sourceOnlyPaths=new Set<string>(MANUAL_SOURCE_ONLY_PATHS);
export const MANUAL_SCREENS: ManualScreen[] = rows.map(([path,title,audience,section,readiness,purpose,action,check])=>({
  path,title,audience,section,
  readiness:sourceOnlyPaths.has(path)?"absent":readiness,
  purpose,action,check,
  ...(sourceOnlyPaths.has(path)?{releaseSource:"Present in main-derived source, absent from inspected 17 Nov 2026 POS-integrated portal build 107fc4f"}:{}),
}));

/** Independently inspected eight built page artifacts from the running
 * POS-integrated staging frontend on 20 Nov 2026, release 107fc4f. These
 * routes are absent from canonical reviewed source and are not accepted as
 * production authority merely because an artifact exists. Disable chapter
 * navigation until release-pair parity and authenticated UAT are complete.
 */
export const MANUAL_STAGING_SCREENS:ManualScreen[]=[
  {
    path:"/admin/inventory/lots",title:"Recorded stock lots — staging only",
    audience:"inventory",section:"Inventory",readiness:"staging",
    releaseSource:"Inspected POS-integrated staging build 107fc4f; not in canonical source",
    purpose:"Review physically recorded lot balances, expiry, quarantine and damaged statuses using filters and mobile/desktop layouts.",
    action:"In reviewed staging with correct inventory role, search by product, variant, lot number or location and filter available, expiring, expired, quarantined or damaged lots.",
    check:"Physical lot quantities are not available-to-sell stock; subtract reservations and safety stock and exclude quarantined or expired lots. This page is read-only.",
  },
  {
    path:"/admin/pos/till-operations",title:"Test till operations — staging only",
    audience:"admin",section:"Counter sales",readiness:"staging",
    releaseSource:"Inspected POS-integrated staging build 107fc4f; not in canonical source",
    purpose:"Private administrator test-till operations provided by the staged VerifiedTillOperations component.",
    action:"Only in a restored isolated test database with approved flags, verify assigned till, opening and movements, role restrictions, and review the resulting record.",
    check:"This is a cash-drawer UAT page, not approval to operate or settle a live till; never introduce real cash or stock-changing tests without the financial gate.",
  },
  {
    path:"/admin/support",title:"Customer support inbox — staging only",
    audience:"admin",section:"Customer service",readiness:"staging",
    releaseSource:"Inspected POS-integrated staging build 107fc4f; not in canonical source",
    purpose:"Review real database-backed customer requests, current statuses and internal case histories.",
    action:"After administrator authentication, filter cases by status, select a case, review source details and use a sanitized test case to validate an approved status update.",
    check:"Customer name, phone, email and notes are private. Confirm ownership before disclosing order or payment information; a case update does not send an SMS or place a call.",
  },
  {
    path:"/staff/cashier",title:"Verified cashier reports — staging only",
    audience:"cashier",section:"Cashier workspace",readiness:"staging",
    releaseSource:"Inspected POS-integrated staging build 107fc4f; not in canonical source",
    purpose:"Read-only cashier workspace for assigned stock locations and authorized cashier reports.",
    action:"Sign in with an approved cashier test account, select an allowed location, and inspect only that cashier\u2019s permitted stock and till evidence.",
    check:"This workspace displays reports; it is not a payment-collection or settlement authorization. Validate direct-URL denial for unrelated users and branches.",
  },
  {
    path:"/staff/demo/[role]",title:"Demo staff role activation — staging only",
    audience:"admin",section:"Administration",readiness:"staging",
    releaseSource:"Inspected POS-integrated staging build 107fc4f; not in canonical source",
    purpose:"Private demonstration role previews using known role identifiers when UAT_DEMO_LOGIN is enabled.",
    action:"In isolated staging only, open the preview through the authorized demo navigation and confirm the resulting interface displays fictional role permissions.",
    check:"A selected demo role cannot grant a real backend session, branch authority or financial approval; disabled flags must return a not-found page.",
  },
  {
    path:"/staff/pos",title:"Authenticated staff POS UAT — staging only",
    audience:"cashier",section:"Counter sales",readiness:"staging",
    releaseSource:"Inspected POS-integrated staging build 107fc4f; not in canonical source",
    purpose:"Gated real-role cashier counter checkout backed by the VerifiedPosUat component.",
    action:"In a restored isolated UAT database with approved test inventory and a test till, verify cashier role, quote, held stock, permitted cash flow and receipt evidence.",
    check:"Do not collect real money, deplete actual stock or assume this feature is live; verify idempotency, cashier branch access and physical handover before any launch consideration.",
  },
  {
    path:"/support",title:"Customer support request — staging only",
    audience:"customer",section:"Account & support",readiness:"staging",
    releaseSource:"Inspected POS-integrated staging build 107fc4f; not in canonical source",
    purpose:"Submit a request for human customer support with contact details, question category, optional order reference and consent.",
    action:"Enter a synthetic support test enquiry, select the preferred reply method, give consent, submit once and check the recorded reference.",
    check:"A recorded support request is not a guaranteed callback, sent SMS, verified order reference, payment change or refund authorization. Never include passwords or payment secrets.",
  },
  {
    path:"/uat",title:"Private staging UAT centre — staging only",
    audience:"admin",section:"Administration",readiness:"staging",
    releaseSource:"Inspected POS-integrated staging build 107fc4f; not in canonical source",
    purpose:"A private role-by-role UAT navigation centre with test journeys for administrators, finance, operations, cashier, inventory, dispatch and customer.",
    action:"With UAT_DEMO_LOGIN and NEXT_PUBLIC_POS_COUNTER_UAT enabled in isolated staging, follow the correct journey to review permitted and denied actions and log results.",
    check:"Demo previews and real authenticated cashier tests are different; neither approves live merchant payments, cash, refunds or stock movement.",
  },
];

/** Source reviewed from separate, unmerged draft PR #175. DO NOT treat these
 * pages as part of the canonical 79 main-derived routes or deployed portal.
 * They become active guide routes only after complete release-pair parity UAT.
 */
export const MANUAL_PENDING_SCREENS:ManualScreen[]=[
  {
    path:"/admin/pos/verified-uat/history",
    title:"POS cash-sale history — draft only",audience:"admin",
    section:"Counter sales",readiness:"pending",releaseSource:"Draft PR #175 — pending staging release parity",
    purpose:"Read-only administrator review of backend-recorded physical cash sales in bounded pages.",
    action:"When this separate POS branch is deployed with its gated read authority, check 25-sale keyset pages, older/newer navigation, on-page search and original immutable receipt links.",
    check:"Verify real admin access; 401/403 for unauthorized sessions; no mutation, tax invoice or settlement claims. Cash-sale backend flag remains OFF by default.",
  },
  {
    path:"/admin/pos/verified-uat/reconciliation",
    title:"POS till reconciliation — draft only",audience:"admin",
    section:"Counter sales",readiness:"pending",releaseSource:"Draft PR #175 — pending staging release parity",
    purpose:"Read-only administrator till reconciliation using authoritative drawer-ledger arithmetic and a guarded CSV export.",
    action:"After independent staging release approval, select a test till, examine opening float and cash movements, compare physical variance with ledger integrity, and verify the authorized CSV snapshot.",
    check:"An open till has no closing count; the last 20 sale references are not total sales. Never interpret drawer count as Hubtel, COD, bank or refund settlement.",
  },
];

/** All documented training chapters: current canonical source + separately
 * labeled draft-only POS pages. Does not change any Next.js application route.
 */
export const MANUAL_DOCUMENTED_SCREENS:ManualScreen[]=[...MANUAL_SCREENS,...MANUAL_STAGING_SCREENS,...MANUAL_PENDING_SCREENS];

export const MANUAL_ROLE_LABELS: Record<ManualRole,string> = {
  admin:"Administrator — all roles", inventory_manager:"Inventory manager",
  cashier:"Cashier", rider:"Rider", customer:"Customer",
};
export const MANUAL_READINESS_LABELS: Record<ManualReadiness,string> = {
  implemented:"Implemented screen (acceptance still required)",
  gated:"UAT / controlled feature gate",
  preview:"Prototype or preview — verify backend authority",
  pending:"DRAFT PR #175 — NOT DEPLOYED, test blocked",
  staging:"STAGING-ONLY — built artifact, parity review required",
  absent:"SOURCE-ONLY — absent from inspected staging portal",
};

/** Filtering is a display aid only: the real backend enforces action permissions. */
export function screensForRole(role:ManualRole): ManualScreen[] {
  if(role==="admin")return MANUAL_DOCUMENTED_SCREENS;
  const allowed:ManualAudience[] = role==="inventory_manager"
    ? ["inventory","shared"] : role==="customer"
      ? ["customer","shared"] : role==="cashier"
        ? ["cashier","shared"] : ["rider","shared"];
  return MANUAL_DOCUMENTED_SCREENS.filter(screen=>allowed.includes(screen.audience));
}
export function screenLink(path:string){
  if(!path.includes("["))return path;
  const segments=path.split("/");
  const index=segments.findIndex(x=>x.startsWith("["));
  return segments.slice(0,index).join("/")||"/";
}
