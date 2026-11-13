import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogProduct } from "@variety/contracts";
import { chooseAvailable, budgetSelection, searchTokens } from "../src/shopping-ai/shopping-ai.service";
import { ApiProblem } from "../src/http/errors";
function product(id:string, priceMinor:number, available:boolean):CatalogProduct{
  return {id,slug:id,name:id,categoryId:"staples",shortDescription:"",description:"",
    tags:[],image:"/test.webp",gallery:[],anyAvailable:available,
    minPriceMinor:priceMinor,minPriceLabel:"₵"+(priceMinor/100).toFixed(2),
    variants:[{id:"v-"+id,name:"Each",unit:"piece",unitSize:"1",priceMinor,
      priceLabel:"₵"+(priceMinor/100).toFixed(2),availableToSell:available?"3":"0",
      isAvailable:available}]};
}
test("suggestions exclude sold-out stock even if it matches",()=>{
  const goods=[product("rice",1550,true),product("rice sold-out",1000,false),product("oil",1500,true)];
  const picks=chooseAvailable(goods,["rice","oil"]);
  assert.deepEqual(picks.map(x=>x.productId).sort(),["oil","rice"]);
  assert.equal(picks.some(x=>x.available==="0"),false);
});
test("budget basket never exceeds the amount and never includes unavailable goods",()=>{
 const goods=[product("rice",1550,true),product("oil",700,true),product("milk",900,true),product("salt",400,false)];
 const basket=budgetSelection(goods,1600);
 assert.ok(basket.totalMinor<=1600);
 assert.equal(basket.totalMinor,basket.items.reduce((sum,item)=>sum+item.priceMinor,0));
 assert.equal(basket.items.some(item=>item.productId==="salt"),false);
 assert.equal(new Set(basket.items.map(x=>x.variantId)).size,basket.items.length);
});
test("invalid budgets fail before querying anything",()=>{
 for(const amount of [-1,100.5,0,Number.MAX_SAFE_INTEGER]){
  assert.throws(()=>budgetSelection([],amount),e=>e instanceof ApiProblem&&e.getStatus()===400);
 }
});
test("jollof shopping expands to staple search terms while avoiding generic words",()=>{
 const words=searchTokens("Please, what do I need for jollof rice?");
 assert.ok(words.includes("rice")); assert.ok(words.includes("tomato"));
 assert.equal(words.includes("please"),false);
});
