/** Retain ambiguous pick intents above the row's loading/unmount boundary.
 * A key is discarded only when a server acknowledgement establishes success.
 * Scope keys to the actual order, reservation and normalized request.
 */
type PickInput={pickedQuantity:string;note?:string};
export class PickReplayLedger {
 private readonly intents=new Map<string,Map<string,string>>();
 constructor(private readonly newKey=()=> "pick:"+crypto.randomUUID()){}
 private scope(orderId:string,reservationId:string){return JSON.stringify([orderId,reservationId]);}
 keyFor(orderId:string,reservationId:string,input:PickInput):string{
  const scope=this.scope(orderId,reservationId);
  let keys=this.intents.get(scope);
  if(!keys){keys=new Map();this.intents.set(scope,keys);}
  const signature=JSON.stringify([input.pickedQuantity,input.note??""]);
  const existing=keys.get(signature);
  if(existing)return existing;
  const key=this.newKey();keys.set(signature,key);return key;
 }
 confirmed(orderId:string,reservationId:string){this.intents.delete(this.scope(orderId,reservationId));}
}
