import {expect,test} from "bun:test";
import type {CashierTillSessionView} from "../src/services/contracts";
import {filterCashTillSessions} from "../src/features/staff/cash-till-filters";

const till=(id:string,tillCode:string,locationId:string,status:"open"|"closed")=>
  ({id,tillCode,locationId,status}) as CashierTillSessionView;
const rows=[
  till("one","ACCRA-01","loc_accra","open"),
  till("two","ACCRA-02","loc_accra","closed"),
  till("three","KUMASI-01","loc_kumasi","closed"),
];

test("cashier filters preserve server order and match till code or location case-insensitively",()=>{
  expect(filterCashTillSessions(rows,"aCcRa","all").map(x=>x.id)).toEqual(["one","two"]);
  expect(filterCashTillSessions(rows," KUMASI-01 ","all").map(x=>x.id)).toEqual(["three"]);
  expect(filterCashTillSessions(rows,"loc_kumasi","all").map(x=>x.id)).toEqual(["three"]);
});

test("cashier status filters never invent sessions or modify server records",()=>{
  expect(filterCashTillSessions(rows,"","closed").map(x=>x.id)).toEqual(["two","three"]);
  expect(filterCashTillSessions(rows,"kUMASI","open")).toEqual([]);
  expect(filterCashTillSessions(rows,"missing","all")).toEqual([]);
  expect(rows).toHaveLength(3);
  expect(rows[0]?.status).toBe("open");
});
