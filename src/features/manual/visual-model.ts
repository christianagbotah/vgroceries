import type {ManualScreen} from "./catalogue";

/** Training-only structural archetypes. These do not invent real values or
 * assert the feature is live; the actual screenshot is a separate UAT artifact.
 */
export type ManualVisualType=
  "catalogue"|"checkout"|"ledger"|"form"|"dashboard"|
  "timeline"|"cash"|"rider"|"guide";

export type ManualVisual={
  kind:ManualVisualType;
  heading:string;
  elements:readonly string[];
  emphasis:string;
};

export function manualVisual(screen:ManualScreen):ManualVisual{
  const p=screen.path;
  if(p.startsWith("/rider/")||p==="/rider"||p.startsWith("/staff/rider/"))
    return {kind:"rider",heading:"Mobile rider workspace",
      elements:["Assigned jobs","Verify delivery proof","Record exception or cash declaration","Review custody and closeout"],
      emphasis:"Physical delivery and cash handover are independent evidence events"};
  if(p.startsWith("/checkout")||p==="/cart")
    return {kind:"checkout",heading:"Customer checkout sequence",
      elements:["Basket & quote","Contact / fulfilment","Payment status","Verified next step"],
      emphasis:"Unverified provider result stays pending"};
  if(p.startsWith("/shop")||p.startsWith("/products")||p.startsWith("/categories")||p==="/")
    return {kind:"catalogue",heading:"Product browsing cards",
      elements:["Search / category","Product image and variant","Price and availability","Basket action"],
      emphasis:"Cart contents are not a reservation"};
  if(p.includes("payments")||p.includes("refund")||p.includes("cashier-session")||
    p.startsWith("/admin/pos")||p.includes("/cashier/workspace"))
    return {kind:"cash",heading:"Financial evidence and drawer view",
      elements:["Actor / register","Cash or provider evidence","Separate approval state","Audit and reconciliation"],
      emphasis:"Do not equate recorded cash with verified electronic settlement"};
  if(p.startsWith("/track")||p.includes("logistics/shipments")||
    p.includes("orders/[id]")||p.includes("returns/[id]")||p.includes("jobs/[id]")||
    p.includes("return-claims"))
    return {kind:"timeline",heading:"Evidence timeline",
      elements:["Original record","Verified event","Current status","Eligible next action"],
      emphasis:"Every status transition must be supported by source evidence"};
  if(p==="/admin"||p==="/admin/reports"||p==="/admin/ai"||p==="/account")
    return {kind:"dashboard",heading:"Overview and KPI panels",
      elements:["Overview","Recent activity","Action queue","Source record drill-down"],
      emphasis:"A summary is not a substitute for its source ledger"};
  if(p.includes("login")||p.includes("signup")||p.includes("password")||
    p.includes("profile")||p.includes("settings")||p.includes("activate")||
    p.includes("/content")||p.includes("addresses")||p.includes("/team/verified")||
    p.includes("adjustments")||p.includes("receiving")||
    p.includes("/products/[id]"))
    return {kind:"form",heading:"Validated entry or edit",
      elements:["Choose permitted record","Enter reviewed information","Validate input","Save and recheck"],
      emphasis:"The backend independently enforces authorization and field validation"};
  if(p==="/help"||p==="/terms"||p==="/privacy"||p==="/returns-policy"||
    p==="/delivery"||p==="/assistant"||p==="/admin/demo")
    return {kind:"guide",heading:"Guidance and assistance",
      elements:["Select topic","Read approved content","Follow relevant action","Confirm policy / support"],
      emphasis:"Published guidance must match current approved business rules"};
  return {kind:"ledger",heading:"Searchable operational records",
    elements:["Filter & search","Record list","Select one record","Review event history"],
    emphasis:"List visibility does not independently authorize mutations"};
}
