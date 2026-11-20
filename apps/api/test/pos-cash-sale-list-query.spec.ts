import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PosCashSalesService } from "../src/cashier-tills/pos-cash-sales.service";
import {
  decodePosCashHistoryCursor, encodePosCashHistoryCursor,
} from "../src/cashier-tills/pos-cash-history-cursor";
import type { Database } from "../src/database/database";
import type { ApiConfig } from "../src/config";
import type { StockDepletionService } from "../src/inventory/stock-depletion.service";

/** Isolated query-efficiency tests, no PostgreSQL, sales or stock writes. */
function sale(n: number) {
  return {
    id: randomUUID(), reference: "VG-POS-TEST-" + n,
    holdId: randomUUID(), tillSessionId: randomUUID(),
    locationId: "loc_accra", soldByUserId: "staff-admin",
    stockDepletionId: randomUUID(), customerMode: "walk_in",
    customerUserId: null, customerName: "Walk-in Customer",
    subtotalMinor: 1250, cashReceivedMinor: 1500, changeGivenMinor: 250,
    cashCountConfirmed: true, goodsHandedOver: true,
    handoverNote: "Counted at counter with original receipt.",
    createdAt: new Date("2026-11-20T09:00:00Z"),
    hold: { lines: [{
      id: randomUUID(), variantId: "rice-1kg",
      quantity: { toString: () => "1" },
      unitPriceMinor: 1250, lineTotalMinor: 1250,
    }] },
  };
}

function setup(data: ReturnType<typeof sale>[], enabled = true) {
  let listCalls = 0;
  let detailCalls = 0;
  let receivedOptions: unknown;
  const fakeDb = {
    posCashSale: {
      findMany: async (options: unknown) => {
        listCalls++;
        receivedOptions = options;
        return data;
      },
      findUnique: async () => {
        detailCalls++;
        throw new Error("N+1 detail query must not occur on history list");
      },
    },
  } as unknown as Database;
  const cfg = {
    posCashSalesEnabled: enabled,
    commerce: { locationId: "loc_accra" },
  } as ApiConfig;
  const instance = new PosCashSalesService(
    fakeDb, cfg, {} as StockDepletionService,
  );
  return {
    instance,
    activity: () => ({ listCalls, detailCalls, receivedOptions }),
  };
}

test("cash history loads at most 50 sales with original hold lines, not N+1 detail queries", async () => {
  const data = Array.from({ length: 50 }, (_, i) => sale(i));
  const { instance, activity } = setup(data);
  const result = await instance.list();
  assert.equal(result.enabled, true);
  assert.equal(result.sales.length, 50);
  assert.equal(result.sales[0]?.reference, "VG-POS-TEST-0");
  assert.equal(result.sales[49]?.reference, "VG-POS-TEST-49");
  assert.deepEqual(result.sales[0]?.lines[0], {
    variantId: "rice-1kg", quantity: "1",
    unitPriceMinor: 1250, lineTotalMinor: 1250,
  });
  assert.deepEqual(activity(), {
    listCalls: 1,
    detailCalls: 0,
    receivedOptions: {
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      include: {
        hold: {
          include: {
            lines: { orderBy: [{ variantId: "asc" }, { id: "asc" }] },
          },
        },
      },
    },
  });
});

test("cash history default-off safety prevents any database read", async () => {
  const { instance, activity } = setup([sale(1)], false);
  await assert.rejects(() => instance.list(), /not activated/i);
  assert.equal(activity().listCalls, 0);
  assert.equal(activity().detailCalls, 0);
});

test("cash history rejects corrupt joined financial details", async () => {
  const row = sale(1);
  row.hold.lines[0]!.lineTotalMinor = -100;
  const { instance, activity } = setup([row]);
  await assert.rejects(() => instance.list());
  assert.equal(activity().listCalls, 1);
  assert.equal(activity().detailCalls, 0);
});

test("cash history accepts no sales in one bounded read", async () => {
  const { instance, activity } = setup([]);
  assert.deepEqual(await instance.list(), { enabled: true, sales: [] });
  assert.equal(activity().listCalls, 1);
  assert.equal(activity().detailCalls, 0);
});

test("keyset cash history returns a bounded 25-row page with a verifiable continuation", async () => {
  const data = Array.from({ length: 26 }, (_, i) => ({
    ...sale(i), createdAt: new Date(Date.UTC(2026,10,20,12,0,0)-i*1000),
  }));
  const { instance, activity } = setup(data);
  const page = await instance.listPage();
  assert.equal(page.enabled, true);
  assert.equal(page.sales.length, 25);
  assert.equal(page.hasMore, true);
  assert.equal(page.sales[24]?.reference, "VG-POS-TEST-24");
  assert.equal(page.nextCursor!==null, true);
  const position = decodePosCashHistoryCursor(page.nextCursor!);
  assert.equal(position?.id, data[24]!.id);
  assert.equal(position?.createdAt.toISOString(),data[24]!.createdAt.toISOString());
  assert.equal(activity().listCalls,1);
  assert.equal(activity().detailCalls,0);
  assert.deepEqual(activity().receivedOptions, {
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:26,
    include:{hold:{include:{lines:{orderBy:[{variantId:"asc"},{id:"asc"}]}}}},
  });
});

test("later keyset page uses both timestamp and ID, never an offset", async () => {
  const pivot=sale(1),date=new Date("2026-11-20T11:59:00.000Z");
  const cursor=encodePosCashHistoryCursor({createdAt:date,id:pivot.id});
  const { instance, activity }=setup([sale(2)]);
  const page=await instance.listPage(cursor,5);
  assert.equal(page.hasMore,false);
  assert.equal(page.nextCursor,null);
  assert.equal(page.sales.length,1);
  assert.deepEqual(activity().receivedOptions,{
    where:{OR:[
      {createdAt:{lt:date}},
      {createdAt:date,id:{lt:pivot.id}},
    ]},
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:6,
    include:{hold:{include:{lines:{orderBy:[{variantId:"asc"},{id:"asc"}]}}}},
  });
});

test("malformed and oversized continuation or page size fail before touching database", async () => {
  const {instance,activity}=setup([sale(1)]);
  for(const cursor of [
    "!", "A", "../evil", "x".repeat(257),
    Buffer.from(JSON.stringify({createdAt:"bad",id:randomUUID()})).toString("base64url"),
    Buffer.from(JSON.stringify({createdAt:new Date().toISOString(),id:"bad"})).toString("base64url"),
    Buffer.from("not-json").toString("base64url"),
  ]) await assert.rejects(()=>instance.listPage(cursor),/Invalid cash sale history cursor/);
  for(const size of [0,-1,51,1.25,Number.POSITIVE_INFINITY])
    await assert.rejects(()=>instance.listPage(undefined,size),/page size/i);
  assert.equal(activity().listCalls,0);
  assert.equal(activity().detailCalls,0);
});

test("a disabled cash-sale authority blocks all paged reads",async()=>{
  const {instance,activity}=setup([sale(1)],false);
  await assert.rejects(()=>instance.listPage(),/not activated/i);
  assert.equal(activity().listCalls,0);
});


test("history cursor rejects noncanonical base64 and extra JSON fields before database access",async()=>{
  const {instance,activity}=setup([sale(1)]);
  const row=sale(2);
  const canonical=encodePosCashHistoryCursor({createdAt:row.createdAt,id:row.id});
  const invalid=[
    canonical+"=", // padding is not permitted by the canonical base64url contract
    canonical.toLowerCase(), // changing encoded bytes must not be silently accepted
    Buffer.from(JSON.stringify({createdAt:row.createdAt.toISOString(),id:row.id,role:"admin"})).toString("base64url"),
  ];
  for(const cursor of invalid)
    await assert.rejects(()=>instance.listPage(cursor),/Invalid cash sale history cursor/);
  assert.equal(activity().listCalls,0);
  assert.equal(activity().detailCalls,0);
});

test("history cursor rejects duplicate keys and noncanonical JSON before querying sales",async()=>{
  const {instance,activity}=setup([sale(1)]);
  const row=sale(2);
  const date=row.createdAt.toISOString();
  const invalid=[
    JSON.stringify({id:row.id,createdAt:date}), // wrong field order
    `{"createdAt":"${date}","id":"${row.id}","id":"${row.id}"}`, // duplicate key
    `{ "createdAt":"${date}","id":"${row.id}" }`, // extra whitespace
  ];
  for(const payload of invalid){
    const cursor=Buffer.from(payload).toString("base64url");
    await assert.rejects(()=>instance.listPage(cursor),/Invalid cash sale history cursor/);
  }
  assert.equal(activity().listCalls,0);
  assert.equal(activity().detailCalls,0);
});

test("history cursor rejects alternate timestamp offsets and precision before database access",async()=>{
  const {instance,activity}=setup([sale(1)]);
  const row=sale(2);
  const invalid=[
    "2026-11-20T09:00:00+00:00",
    "2026-11-20T09:00:00Z",
    "2026-11-20T10:00:00.000+01:00",
  ];
  for(const createdAt of invalid){
    const cursor=Buffer.from(JSON.stringify({createdAt,id:row.id})).toString("base64url");
    await assert.rejects(()=>instance.listPage(cursor),/Invalid cash sale history cursor/);
  }
  assert.equal(activity().listCalls,0);
  assert.equal(activity().detailCalls,0);
});


test("history cursor encoder fails closed on invalid source records", () => {
  const validId = randomUUID();
  assert.throws(
    () => encodePosCashHistoryCursor({ createdAt: new Date(Number.NaN), id: validId }),
    /Cannot generate cash history cursor from invalid record/,
  );
  assert.throws(
    () => encodePosCashHistoryCursor({ createdAt: new Date("2026-11-20T09:00:00.000Z"), id: "not-a-uuid" }),
    /Cannot generate cash history cursor from invalid record/,
  );
  const createdAt = new Date("2026-11-20T09:00:00.000Z");
  const cursor = encodePosCashHistoryCursor({ createdAt, id: validId });
  assert.deepEqual(decodePosCashHistoryCursor(cursor), { createdAt, id: validId });
});

test("history cursor rejects non-object JSON, invalid UTF-8 and non-UUID identities before reads", async () => {
  const {instance,activity}=setup([sale(1)]);
  const createdAt="2026-11-20T09:00:00.000Z";
  const payloads=[
    "null",
    "[]",
    JSON.stringify({createdAt,id:null}),
    JSON.stringify({createdAt,id:123}),
    JSON.stringify({createdAt,id:"00000000-0000-0000-0000-000000000000"}),
    JSON.stringify({createdAt,id:randomUUID(),unexpected:"extra"}),
  ];
  const cursors=[
    ...payloads.map(payload=>Buffer.from(payload).toString("base64url")),
    Buffer.from([0xc3,0x28]).toString("base64url"),
    Buffer.from([0xff,0xfe,0xfd]).toString("base64url"),
  ];
  for(const cursor of cursors)
    await assert.rejects(()=>instance.listPage(cursor),/Invalid cash sale history cursor/);
  assert.equal(activity().listCalls,0);
  assert.equal(activity().detailCalls,0);
});
