import {ApiError} from "@/services/adapters/types";
import {createTillIntent,type TillIntent,type TillCommandKind} from "./verified-till-command-client";
type RecoveryStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
export const TILL_RECOVERY_KEY="vg:verified-till:unresolved:v1";
const blocked=()=>new ApiError("BAD_RESPONSE","Unresolved drawer action recovery is unavailable. Inspect the server ledger before proceeding.");
export function readTillRecovery(storage:RecoveryStorage,actorId:string):TillIntent|null{
 let raw:string|null;
 try{raw=storage.getItem(TILL_RECOVERY_KEY);}catch{throw blocked();}
 if(raw===null)return null;
 if(raw.length>4096)throw blocked();
 let value:unknown;
 try{value=JSON.parse(raw);}catch{throw blocked();}
 if(!value||typeof value!=="object"||Array.isArray(value))throw blocked();
 const row=value as Record<string,unknown>;
 if(!actorId||row.actorId!==actorId)throw new ApiError("FORBIDDEN","The original administrator must resolve the pending drawer action.");
 if(row.version!==1||typeof row.kind!=="string"||!["open","move","close"].includes(row.kind)||typeof row.key!=="string"||
  (row.sessionId!==undefined&&typeof row.sessionId!=="string"))throw blocked();
 try{return createTillIntent(row.kind as TillCommandKind,row.sessionId as string|undefined,row.body,row.key);}catch{throw blocked();}
}
export function saveTillRecovery(storage:RecoveryStorage,actorId:string,intent:TillIntent){
 if(!actorId)throw blocked();
 const prior=readTillRecovery(storage,actorId);
 const checked=createTillIntent(intent.kind,intent.sessionId,intent.body,intent.key);
 if(prior&&JSON.stringify(prior)!==JSON.stringify(checked))throw blocked();
 try{storage.setItem(TILL_RECOVERY_KEY,JSON.stringify({version:1,actorId,...checked}));}catch{throw blocked();}
}
export function clearTillRecovery(storage:RecoveryStorage,actorId:string,intent:TillIntent){
 const prior=readTillRecovery(storage,actorId);
 if(!prior||JSON.stringify(prior)!==JSON.stringify(intent))throw blocked();
 try{storage.removeItem(TILL_RECOVERY_KEY);}catch{throw blocked();}
}
