import type {ManualAudience,ManualRole} from "./catalogue";

export type ManualWorkflow={
  id:string;title:string;audience:ManualAudience;
  summary:string;stages:readonly string[];gate:string;whatNext:string;
};
export const MANUAL_WORKFLOWS:ManualWorkflow[]=[
  {id:"shopping",title:"Customer shopping and verified payment",audience:"customer",
    summary:"From selecting groceries to an authorized order; checkout is not final until the provider has been independently verified.",
    stages:["Find product and verify variant","Basket (no stock reservation)","Server quote and stock reservation","Choose fulfillment and provider","Payment pending — verify callback/status","Verified order or safe failure","Pick, pack and hand over"],
    gate:"Never mark an order paid from browser redirect, SMS, HTTP 200 or a self-reported screen alone.",
    whatNext:"Use My orders or Track order; failed or pending payment must remain explicitly unresolved."},
  {id:"fulfilment",title:"Stock-safe picking and delivery",audience:"admin",
    summary:"Fulfilment uses the original eligible order and stock-reservation evidence; dispatch and delivery are separate.",
    stages:["Check paid / eligible order","Confirm reserved products and quantities","Pick from authorized lot","Record packing evidence","Approve stock handover once","Assign dispatch and rider","Verify delivery or pickup proof"],
    gate:"No duplicate stock decrement: handover must reference the approved depletion record.",
    whatNext:"If short or damaged, follow the authorized substitution/exception flow; never adjust stock silently."},
  {id:"inventory",title:"Receiving, inventory and audited adjustments",audience:"inventory",
    summary:"Physical stock movement is tied to verified item, lot, expiry, location and a durable evidence trail.",
    stages:["Select correct branch / SKU","Receive actual goods and record lot","Inspect quantities and expiry","Post authorized physical receipt","Inspect sellable vs reserved balance","Raise adjustment with reason","Separate approval and audit"],
    gate:"A purchase order, spreadsheet edit or draft adjustment is not proof of physical receipt.",
    whatNext:"Exclude quarantined, expired, reserved and safety stock from available-to-sell."},
  {id:"pos",title:"Counter cash sale: gated UAT workflow",audience:"admin",
    summary:"Separate, currently gated physical cash path. Do not confuse the cashier read-only workspace with a live sales terminal.",
    stages:["Verify real administrator and open till","Quote from authoritative stock","Reserve hold with expiry","Physically count cash and change","Attest goods handover","One replay-safe stock depletion and cash record","Review original receipt / drawer reconciliation"],
    gate:"Only authorized real-cash operations behind explicit backend flags; the read-only cashier workspace cannot execute these actions.",
    whatNext:"Cash receipt is not a VAT invoice, MoMo confirmation, bank reconciliation or financial settlement."},
  {id:"drawer",title:"Cash-drawer shift reconciliation",audience:"admin",
    summary:"Review the source ledger and distinguish a physical cash count difference from an internal accounting mismatch.",
    stages:["Verify opening float","Review signed cash in/out/drop movements","Include recorded physical cash sales","Compute expected drawer amount","Count drawer on authorized close","Compare difference vs expected","Review immutable reconciliation and CSV"],
    gate:"An internally consistent ledger may still have a physical cash shortage or overage.",
    whatNext:"Escalate differences with cash evidence; never reinterpret them as a successful electronic payment."},
  {id:"cod",title:"Rider COD declaration and independent review",audience:"rider",
    summary:"Rider-collected cash is separate from order delivery and from merchant remittance.",
    stages:["Deliver eligible unpaid COD order","Capture independent delivery proof","Physically count actual cash","Rider declares possession and amount","Administrator checks exception / count","Second independent review where required","Verified handoff and reconciliation (future gate)"],
    gate:"Rider declaration is not a bank deposit, supervisor receipt or fulfilled remittance obligation.",
    whatNext:"Keep a clear exception record for mismatched amounts; do not mark the payment electronically settled."},
  {id:"returns",title:"Customer return request and inspected goods custody",audience:"customer",
    summary:"A customer claim, physical receipt, inspection, resale decision and refund are distinct approvals.",
    stages:["Review delivered order and eligible quantity","Submit customer-owned claim","Administrator accepts or rejects request","Staff physically receives linked goods","Inspect and quarantine by lot","Authorize safe resale only if eligible","Separate payment refund / reconciliation decision"],
    gate:"An accepted request or a delivery return must never automatically restock goods or release money.",
    whatNext:"Food, expired, damaged and unverified lots remain non-saleable."},
  {id:"cms",title:"Publish verified catalogue and storefront content",audience:"admin",
    summary:"Public content must be based on reviewed source material, not generated assurances.",
    stages:["Prepare accurate product / page draft","Validate images, units and original sources","Check pricing, tax and availability","Review customer-facing copy","Approve for publication","Publish through supported CMS","Verify public site and SEO metadata"],
    gate:"Do not publish invented nutrition facts, availability, provider claims or return terms.",
    whatNext:"Recheck live appearance on mobile after approval and publication."},
  {id:"dispatch",title:"Dispatcher and rider operational lifecycle",audience:"admin",
    summary:"Shipping and fulfilment are evidence-based steps, not predictions of location or cash.",
    stages:["Eligible packed order","Plan assigned route and permitted node","Dispatch to authorized rider/provider","Confirm pickup and custody","Record evidence-backed checkpoints","Obtain delivery/collection proof","Resolve exception separately"],
    gate:"An automated stage change must not fabricate a GPS point, ETA, pickup, delivery or COD payment.",
    whatNext:"Use exception screens for failed, late, returned or uncontactable deliveries."},
  {id:"staff",title:"Staff onboarding and access revocation",audience:"admin",
    summary:"Each role requires the correct server-owned permission and branch; a menu being visible grants nothing by itself.",
    stages:["Administrator creates staff invitation","Specify role and active branch scope","Invitee validates single-use token","Set credentials and activate","Recheck server-reported role","Operate only authorized endpoints","Revoke / disable access with audit"],
    gate:"Demo identities, old invitation links and browser role selectors must not become authorization.",
    whatNext:"Review audit trails and branch permissions after any staff change."},
  {id:"support",title:"Customer self-service and support",audience:"customer",
    summary:"Customer account views are scoped to their own identity; support must verify ownership before accessing records.",
    stages:["Sign in or use eligible guest checkout","Open account / recent order","Review independent payment and fulfillment","Read official notification","Request eligible cancellation / return","Provide requested evidence","Track a verified resolution"],
    gate:"Never share an account password, reset token or provider secret with support agents.",
    whatNext:"Escalate uncertain status rather than telling the customer money has moved."},
];
export function workflowsForRole(role:ManualRole):ManualWorkflow[]{
  if(role==="admin")return MANUAL_WORKFLOWS;
  const byRole:Record<Exclude<ManualRole,"admin">,readonly ManualAudience[]>={
    inventory_manager:["inventory","shared"],
    cashier:["cashier","shared"],
    rider:["rider","shared"],
    customer:["customer","shared"],
  };
  const allowed=byRole[role];
  // Cashier can read the cash-handling training, without accessing its admin-only screens.
  return MANUAL_WORKFLOWS.filter(flow=>allowed.includes(flow.audience)||
    (role==="cashier"&&(flow.id==="pos"||flow.id==="drawer")));
}
