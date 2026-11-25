import {describe,expect,test} from "bun:test";
import {internalTransferListSchema,formatTransferMoney} from "../packages/contracts/src/internal-transfers";
import {restEndpoints} from "../packages/contracts/src/endpoints";
import {operationMeta} from "../src/services/operation-registry";
const time="2026-11-25T12:00:00.000Z";
const row={id:"t1",destinationId:"a",sourceId:"b",status:"in_transit",version:4,requestedBy:"requester",note:"Synthetic test",decidedBy:"admin",decisionNote:"Approved",createdAt:time,decidedAt:time,lines:[{id:"l1",variantId:"rice",quantity:"2.5"}],reservedBy:"source",reservedAt:time,reservationExpiresAt:time,cancelledBy:null,cancelledAt:null,cancellationNote:null,reservationStatus:"consumed",stockReserved:false,stockMoved:true,financialPostingCreated:false,dispatch:{id:"d1",dispatchedAt:time,dispatchedBy:"source",handoverReference:"SYNTHETIC",currency:"GHS",totalValueMinor:"6250",lots:[{id:"dl1",lotId:"lot1",variantId:"rice",quantity:"2.5",lotNumber:"BATCH",expiryDate:null,unitCostMinor:2500,valueMinor:"6250"}]}};
const parse=(value:unknown)=>internalTransferListSchema.safeParse({items:[value],capped:false}).success;
describe("verified branch transfer workspace",()=>{
 test("maps only a noncached read",()=>{
  expect(restEndpoints["inventory.verified.transfers"]).toEqual({method:"GET",path:"/inventory/transfer-requisitions"});
  expect(operationMeta["inventory.verified.transfers"]).toEqual({});
 });
 test("accepts original dispatch evidence and rejects contradictory or invented posting evidence",()=>{
  expect(parse(row)).toBe(true);
  expect(parse({...row,financialPostingCreated:true})).toBe(false);
  expect(parse({...row,dispatch:null})).toBe(false);
  expect(parse({...row,stockReserved:true})).toBe(false);
  expect(parse({...row,dispatch:{...row.dispatch,totalValueMinor:"6251"}})).toBe(false);
 });
 test("malformed amounts fail without throwing",()=>{
  expect(parse({...row,dispatch:{...row.dispatch,totalValueMinor:"broken"}})).toBe(false);
  expect(parse({...row,dispatch:{...row.dispatch,lots:[{...row.dispatch.lots[0],valueMinor:"x"}]}})).toBe(false);
 });
 test("minor units remain exact even outside safe floating point range",()=>{
  expect(formatTransferMoney("1")).toBe("₵0.01");
  expect(formatTransferMoney("250000")).toBe("₵2,500.00");
  expect(formatTransferMoney("9223372036854775807")).toBe("₵92,233,720,368,547,758.07");
 });
});
