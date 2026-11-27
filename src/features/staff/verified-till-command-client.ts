import {cashierTillOpenSchema,cashierTillMoveSchema,cashierTillCloseSchema,cashierTillSessionViewSchema,replayKeySchema,type CashierTillSessionView} from "@/services/contracts";
import {ApiError} from "@/services/adapters/types";
import {assertVerifiedPosQuoteUat} from "./verified-pos-quote-client";
import {isDemoStaffSessionActive} from "./staff-demo-session";
export const verifiedTillCommandsEnabled=process.env.NEXT_PUBLIC_VERIFIED_POS_TILL_COMMANDS_UAT==="1";
const schemas={open:cashierTillOpenSchema,move:cashierTillMoveSchema,close:cashierTillCloseSchema} as const;
export type TillCommandKind=keyof typeof schemas;
export type TillIntent={kind:TillCommandKind;sessionId?:string;body:Record<string,unknown>;key:string};
export function createTillIntent(kind:TillCommandKind,sessionId:string|undefined,raw:unknown,key="till:"+crypto.randomUUID()):TillIntent{
 const parsed=schemas[kind].safeParse(raw);
 if(!parsed.success||!replayKeySchema.safeParse(key).success||
  (kind==="open"?sessionId!==undefined:!sessionId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)))
  throw new ApiError("VALIDATION_FAILED","Enter valid till details, cash amount and required reason.");
 return {kind,sessionId,body:parsed.data as Record<string,unknown>,key};
}
export function assertTillActor(expectedActorId:string,actor:{id:string;role:string}){
 if(!expectedActorId||actor.role!=="admin"||actor.id!==expectedActorId)throw new ApiError("FORBIDDEN","The original administrator must resolve this drawer action.");
}
export async function executeTillIntent(intent:TillIntent,expectedActorId:string):Promise<CashierTillSessionView>{
 assertVerifiedPosQuoteUat({enabled:verifiedTillCommandsEnabled,demo:isDemoStaffSessionActive(),apiBase:process.env.NEXT_PUBLIC_API_BASE_URL});
 const {api,apiOps}=await import("@/services/client");
 assertTillActor(expectedActorId,(await apiOps.staffSession()).actor);
 const checked=createTillIntent(intent.kind,intent.sessionId,intent.body,intent.key);
 const raw=await api<unknown>("pos.verified.till."+checked.kind,{query:checked.sessionId?{sessionId:checked.sessionId}:undefined,body:checked.body,idempotencyKey:checked.key});
 const result=cashierTillSessionViewSchema.safeParse(raw);
 if(!result.success)throw new ApiError("BAD_RESPONSE","Till outcome could not be verified. Inspect the ledger before another action.");
 const v=result.data;
 if((checked.sessionId&&v.id!==checked.sessionId)||
 (checked.kind==="open"&&(v.status!=="open"||v.locationId!==checked.body.locationId||v.tillCode!==checked.body.tillCode||v.openingFloatMinor!==checked.body.openingFloatMinor))||
 (checked.kind==="move"&&v.status!=="open")||
 (checked.kind==="close"&&(v.status!=="closed"||v.closingCountedMinor!==checked.body.countedCashMinor)))
  throw new ApiError("BAD_RESPONSE","Till outcome did not match the requested action.");
 return v;
}
