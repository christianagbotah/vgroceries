/** Authenticated, screen-by-screen training catalogue. This describes UI screens,
 * not permissions to perform server mutations. Never derive a real role from
 * a URL, query parameter, demo role selector, or browser storage.
 */
export type ManualRole = "admin" | "inventory_manager" | "cashier" | "rider" | "customer";
export type ManualAudience = "admin" | "inventory" | "cashier" | "rider" | "customer" | "shared";
export type ManualReadiness = "preview" | "gated" | "implemented";

export interface ManualScreen {
  path: string;
  title: string;
  audience: ManualAudience;
  section: string;
  readiness: ManualReadiness;
  purpose: string;
  action: string;
  check: string;
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

export const MANUAL_SCREENS: ManualScreen[] = rows.map(([path,title,audience,section,readiness,purpose,action,check])=>({
  path,title,audience,section,readiness,purpose,action,check,
}));

export const MANUAL_ROLE_LABELS: Record<ManualRole,string> = {
  admin:"Administrator — all roles", inventory_manager:"Inventory manager",
  cashier:"Cashier", rider:"Rider", customer:"Customer",
};
export const MANUAL_READINESS_LABELS: Record<ManualReadiness,string> = {
  implemented:"Implemented screen (acceptance still required)",
  gated:"UAT / controlled feature gate",
  preview:"Prototype or preview — verify backend authority",
};

/** Filtering is a display aid only: the real backend enforces action permissions. */
export function screensForRole(role:ManualRole): ManualScreen[] {
  if(role==="admin")return MANUAL_SCREENS;
  const allowed:ManualAudience[] = role==="inventory_manager"
    ? ["inventory","shared"] : role==="customer"
      ? ["customer","shared"] : role==="cashier"
        ? ["cashier","shared"] : ["rider","shared"];
  return MANUAL_SCREENS.filter(screen=>allowed.includes(screen.audience));
}
export function screenLink(path:string){
  if(!path.includes("["))return path;
  const segments=path.split("/");
  const index=segments.findIndex(x=>x.startsWith("["));
  return segments.slice(0,index).join("/")||"/";
}
