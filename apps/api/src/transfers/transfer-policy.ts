/** Pure, server-side transfer authority. Call only with persisted location,
 * state and authenticated actor facts; never with a browser-supplied role. */
export type TransferState = "requested"|"authorized"|"reserved"|"in_transit"|"partially_received"|"reconciliation"|"completed"|"rejected"|"cancelled";
export type TransferAction = "request"|"authorize"|"reject"|"reserve"|"dispatch"|"receive"|"reconcile"|"close"|"cancel";
export type TransferActor = {id:string;role:string;locationIds:readonly string[]};
export type TransferFacts = {
 state:TransferState|null;
 destinationId:string;
 sourceId:string|null;
 destinationActive:boolean;
 sourceActive:boolean;
 authorizedBy:string|null;
 dispatchedBy:string|null;
 requestedBy:string|null;
};
const allowed: Record<TransferAction, readonly (TransferState|null)[]> = {
 request:[null], authorize:["requested"], reject:["requested"],
 reserve:["authorized"], dispatch:["reserved"],
 receive:["in_transit","partially_received"], reconcile:["reconciliation","partially_received","in_transit"],
 close:["reconciliation","partially_received","in_transit"], cancel:["requested","authorized","reserved"],
};
/** Existing admin role represents head office until scoped delegated roles are built.
 * Membership at BOTH branches is not sufficient to authorize a transfer. */
export function mayActOnTransfer(actor:TransferActor,action:TransferAction,facts:TransferFacts):boolean {
 if(!actor.id || !facts.destinationId || !facts.destinationActive || !allowed[action].includes(facts.state))return false;
 const headOffice=actor.role==="admin";
 const scoped=actor.role==="inventory_manager";
 const at=(id:string|null)=>Boolean(id && (headOffice || (scoped && actor.locationIds.includes(id))));
 const validRoute=Boolean(facts.sourceId && facts.sourceActive && facts.sourceId!==facts.destinationId);
 if(action==="request")return at(facts.destinationId) && facts.sourceId===null && facts.authorizedBy===null;
 if(action==="authorize")return headOffice && validRoute && !facts.authorizedBy && Boolean(facts.requestedBy);
 if(action==="reject"||action==="cancel")return headOffice;
 if(!validRoute||!facts.authorizedBy)return false;
 if(action==="reserve"||action==="dispatch")return at(facts.sourceId);
 if(action==="receive")return Boolean(facts.dispatchedBy) && at(facts.destinationId);
 return headOffice && Boolean(facts.dispatchedBy);
}
