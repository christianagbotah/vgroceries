"use client";
import { apiOps, ApiError, type AssistantResponse, type BudgetBasketResponse, type CatalogProduct } from "@/services/client";
import { formatMoney } from "@/lib/money";

/** Verifiable catalogue guidance when the live API has no generative AI endpoint. */
const STOP=new Set(["what","which","where","when","are","can","could","please","some","have","need","with","this","that","want","from","under","about","your","their","give","find","show","buy","price","available","there","groceries","grocery","items","product","products"]);
function tokens(s:string):string[]{return Array.from(new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/ +/).filter(w=>w.length>2&&!STOP.has(w)))).slice(0,4);}
async function findAvailable(queries:string[],perPage=24):Promise<CatalogProduct[]>{
  const result=await Promise.allSettled(queries.map(query=>apiOps.products({query,page:1,perPage})));
  const successful=result.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof apiOps.products>>>=>r.status==="fulfilled");
  if(!successful.length)throw new ApiError("CATALOG_UNAVAILABLE","Current catalogue data could not be verified. Try again.");
  const ids=new Set<string>();
  return successful.flatMap(r=>r.value.items).filter(p=>{if(ids.has(p.id)||!p.variants.some(v=>v.isAvailable))return false;ids.add(p.id);return true;});
}
function suggestions(products:CatalogProduct[],max:number):AssistantResponse["suggestions"]{
 return products.slice(0,max).flatMap(p=>{const v=p.variants.find(x=>x.isAvailable);return v?[{productId:p.id,variantId:v.id,label:p.name+" — "+v.name,priceMinor:v.priceMinor,available:v.availableToSell}]:[];});
}
export async function groundedShoppingAnswer(question:string):Promise<AssistantResponse>{
 const q=question.trim().slice(0,400);
 if(!q)throw new ApiError("VALIDATION_FAILED","Ask a question first.");
 if(!process.env.NEXT_PUBLIC_API_BASE_URL?.trim())return apiOps.assistant(q);
 if(/\b(order|parcel|rider|tracking|track|where is my)\b/i.test(q))
   return {answer:"For the current progress of an order, open Track order and complete verification. I cannot disclose private order or rider details from an unverified chat.",evidence:["Order tracking requires verification"],suggestions:[]};
 const terms=tokens(q),products=await findAvailable(terms.length?terms:[q]);
 products.sort((a,b)=>{const score=(p:CatalogProduct)=>terms.reduce((n,t)=>n+(p.name.toLowerCase().includes(t)?3:p.tags.join(" ").toLowerCase().includes(t)?1:0),0);return score(b)-score(a);});
 const found=suggestions(products,5);
 return found.length?{answer:"Here are currently listed options: "+found.map(p=>p.label+" at "+formatMoney(p.priceMinor)).join("; ")+". Final prices and availability are rechecked at checkout.",evidence:found.map(p=>p.label+": "+formatMoney(p.priceMinor)+"; "+p.available+" listed available"),suggestions:found}
  :{answer:"I could not find an available product matching that request. Try a product name or browse the shop.",evidence:["No matching sellable items in latest catalogue search"],suggestions:[]};
}
export async function groundedBudgetBasket(budgetMinor:number):Promise<BudgetBasketResponse>{
 if(!Number.isSafeInteger(budgetMinor)||budgetMinor<100)throw new ApiError("VALIDATION_FAILED","Enter a budget of at least ₵1.00.");
 if(!process.env.NEXT_PUBLIC_API_BASE_URL?.trim())return apiOps.budgetBasket(budgetMinor);
 const choices=suggestions(await findAvailable([""],100),100).filter(p=>p.priceMinor>0).sort((a,b)=>a.priceMinor-b.priceMinor);
 const items:AssistantResponse["suggestions"]=[];let totalMinor=0;
 for(const item of choices){if(items.length>=8)break;if(totalMinor+item.priceMinor<=budgetMinor){items.push(item);totalMinor+=item.priceMinor;}}
 return {items,totalMinor,note:items.length?"A reviewable basket at currently listed prices. Confirm stock and total at checkout.":"No available items fit this budget."};
}
