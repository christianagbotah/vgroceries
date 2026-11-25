/** Exact base-unit valuation for internal transfers. Quantity is expressed
 * in thousandths of a base unit, money in integer minor currency units.
 * Source lot unit cost is a persisted snapshot, never a selling price.
 * No supplier liability, revenue or tax is created by an internal movement. */
const MAX_QUANTITY_MILLI=999999999999999n;
const MAX_UNIT_COST_MINOR=2147483647;
export function quantityMilli(value:string):bigint {
 if(!/^\d{1,12}(\.\d{1,3})?$/.test(value))throw new Error("Invalid base-unit quantity");
 const [whole,fraction=""]=value.split(".");
 const result=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,"0"));
 if(result>MAX_QUANTITY_MILLI)throw new Error("Quantity exceeds stock precision");
 return result;
}
function amount(q:bigint,cost:number|null):bigint {
 if(cost===null||!Number.isInteger(cost)||cost<0||cost>MAX_UNIT_COST_MINOR)throw new Error("Known source lot unit cost is required");
 if(q<0n||q>MAX_QUANTITY_MILLI)throw new Error("Invalid quantity");
 return (q*BigInt(cost)+500n)/1000n;
}
export type TransferLotValueInput={
 dispatchedQuantity:string;
 acceptedQuantityBefore:string;
 acceptedQuantityAfter:string;
 unitCostMinor:number|null;
};
/** Round cumulative accepted quantity once, then take the difference.
 * This prevents repeated partial receipts from accumulating rounding drift.
 * Unreceived value stays in transit, including damaged/missing units until
 * an authorized, separately posted resolution accounts for them. */
export function transferLotValuation(input:TransferLotValueInput){
 const dispatched=quantityMilli(input.dispatchedQuantity);
 const before=quantityMilli(input.acceptedQuantityBefore);
 const after=quantityMilli(input.acceptedQuantityAfter);
 if(dispatched<=0n||before>after||after>dispatched)throw new Error("Receipt exceeds dispatched quantity or reverses accepted stock");
 const dispatchedValue=amount(dispatched,input.unitCostMinor);
 const priorReceivedValue=amount(before,input.unitCostMinor);
 const receivedValue=amount(after,input.unitCostMinor);
 const receiptValue=receivedValue-priorReceivedValue;
 const transitValue=dispatchedValue-receivedValue;
 return {
  dispatchedQuantityMilli:dispatched.toString(),
  acceptedQuantityMilli:after.toString(),
  outstandingQuantityMilli:(dispatched-after).toString(),
  dispatchedValueMinor:dispatchedValue.toString(),
  receiptValueMinor:receiptValue.toString(),
  acceptedValueMinor:receivedValue.toString(),
  outstandingValueMinor:transitValue.toString(),
  fullyReceived:after===dispatched,
 };
}

/** Value removed from an existing lot, using rounded before/after carrying
 * values. A later receipt must allocate this exact snapshot total, not
 * independently round quantity times unit cost again. */
export function dispatchCarryingValue(before:string,after:string,cost:number|null):bigint{
 const b=quantityMilli(before),a=quantityMilli(after);
 if(a>=b)throw new Error("Dispatch must decrease lot quantity");
 return amount(b,cost)-amount(a,cost);
}
