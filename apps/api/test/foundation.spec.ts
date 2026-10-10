import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { randomBytes, scryptSync } from "node:crypto";
import {
  shopPageDataSchema,
  catalogProductSchema,
  foundationCategorySchema,
  foundationHomeSchema,
  foundationProductDetailSchema,
  foundationInventoryOverviewSchema,
  webSessionResponseSchema,
  nativeSessionResponseSchema,
  sessionLookupResponseSchema,
} from "@variety/contracts";
import type { INestApplication } from "@nestjs/common";
let app: INestApplication;
let second: INestApplication;
let base: string;
let secondBase: string;
let db: Database;
const password = "Verified-test-password-2026";
function fixtureHash() {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$1$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
}
async function request(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  url = base,
) {
  const r = await fetch(url + "/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { r, body: await r.json() };
}
async function login(email = "admin@example.test", client = "web", url = base) {
  return request(
    "/auth/sessions",
    { email, password, client },
    { origin: "http://localhost:3000" },
    url,
  );
}
function webHeaders(result: Awaited<ReturnType<typeof request>>) {
  return {
    cookie: result.r.headers.get("set-cookie")!.split(";")[0],
    origin: "http://localhost:3000",
    "x-csrf-token": result.body.data.csrfToken,
  };
}
before(async () => {
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  if (
    !new URL(process.env.DATABASE_URL!).pathname.endsWith(
      "variety_foundation_test",
    )
  )
    throw Error("Tests require the isolated variety_foundation_test database");
  await db.$executeRawUnsafe(
    'TRUNCATE "User", "Category", "Location", "StockReceipt", "Idempotency", "AuditEvent", "OutboxEvent", "LoginThrottle" CASCADE',
  );
  for (const [email, role] of [
    ["admin@example.test", "admin"],
    ["customer@example.test", "customer"],
    ["warehouse@example.test", "inventory_manager"],
    ["disabled@example.test", "customer"],
    ["throttle@example.test", "customer"],
  ] as const)
    await db.user.create({
      data: {
        id: email,
        email,
        name: email,
        passwordHash: fixtureHash(),
        role,
        active: !email.startsWith("disabled"),
      },
    });
  await db.location.createMany({
    data: [
      { id: "loc_accra", name: "Accra" },
      { id: "loc_kumasi", name: "Kumasi" },
      { id: "loc_inactive", name: "Inactive", active: false },
    ],
  });
  await db.userLocation.create({
    data: { userId: "warehouse@example.test", locationId: "loc_accra" },
  });
  await db.category.createMany({
    data: [
      { id: "cat_food", slug: "food", name: "Food" },
      { id: "cat_inactive", slug: "inactive", name: "Inactive", active: false },
    ],
  });
  for (const [id, published, categoryId] of [
    ["rice", true, "cat_food"],
    ["salt", true, "cat_food"],
    ["hidden", false, "cat_food"],
    ["inactive-category", true, "cat_inactive"],
  ] as const) {
    await db.product.create({
      data: {
        id,
        slug: id,
        name: id,
        categoryId,
        published,
        tags: ["groceries"],
        image: "/images/rice.webp",
        variants: {
          create: {
            id: "var_" + id,
            sku: id,
            name: "standard",
            unit: id === "rice" ? "kg" : "piece",
            priceMinor: 1250,
            compareAtPriceMinor: id === "rice" ? 1500 : null,
          },
        },
      },
    });
    await db.stockPosition.create({
      data: {
        id: "pos_" + id,
        variantId: "var_" + id,
        locationId: "loc_accra",
        safetyStock: id === "rice" ? "2" : "0",
        lots: {
          create: {
            id: "lot_" + id,
            lotNumber: id,
            quantity: id === "rice" ? "10.125" : id === "salt" ? "0" : "50",
          },
        },
      },
    });
  }
  await db.stockLot.createMany({
    data: [
      {
        id: "expired",
        positionId: "pos_rice",
        lotNumber: "expired",
        quantity: "100",
        expiryDate: new Date("2020-01-01"),
      },
      {
        id: "today",
        positionId: "pos_rice",
        lotNumber: "today",
        quantity: "100",
        expiryDate: new Date(new Date().toISOString().slice(0, 10)),
      },
      {
        id: "quarantine",
        positionId: "pos_rice",
        lotNumber: "quarantine",
        quantity: "30",
        quarantined: true,
      },
      {
        id: "damaged",
        positionId: "pos_rice",
        lotNumber: "damaged",
        quantity: "40",
        kind: "damaged",
      },
    ],
  });
  await db.reservation.createMany({
    data: [
      {
        positionId: "pos_rice",
        lotId: "lot_rice",
        claimType: "order",
        claimId: "fixture-active",
        claimLineId: "fixture-active-line",
        quantity: "1.125",
        expiresAt: new Date(Date.now() + 3600000),
      },
      {
        positionId: "pos_rice",
        lotId: "lot_rice",
        claimType: "order",
        claimId: "fixture-expired",
        claimLineId: "fixture-expired-line",
        quantity: "999",
        expiresAt: new Date(0),
      },
    ],
  });
  await db.variant.create({
    data: {
      id: "var_disabled",
      sku: "disabled",
      productId: "rice",
      name: "disabled",
      unit: "kg",
      priceMinor: 1,
      active: false,
      positions: {
        create: {
          id: "pos_disabled",
          locationId: "loc_accra",
          lots: { create: { lotNumber: "disabled", quantity: "999" } },
        },
      },
    },
  });
  await db.stockPosition.create({
    data: {
      id: "pos_kumasi",
      variantId: "var_rice",
      locationId: "loc_kumasi",
      lots: { create: { lotNumber: "kumasi", quantity: "20" } },
    },
  });
  await db.stockPosition.create({
    data: {
      id: "pos_inactive",
      variantId: "var_rice",
      locationId: "loc_inactive",
      lots: { create: { lotNumber: "inactive", quantity: "999" } },
    },
  });
  second = await createApplication();
  await second.listen(0, "127.0.0.1");
  secondBase = await second.getUrl();
});
beforeEach(async () => {
  await db.loginThrottle.deleteMany();
});
after(async () => {
  await second?.close();
  await app?.close();
});
test("liveness reports the running API", async () => {
  const r = await fetch(base + "/api/v1/health/live");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data.status, "ok");
});
test("readiness verifies actual PostgreSQL", async () => {
  const r = await fetch(base + "/api/v1/health/ready");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data.database, "up");
});
test("unknown routes return a safe envelope with request correlation", async () => {
  const r = await fetch(base + "/api/v1/demo/reset");
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.match(r.headers.get("x-request-id")!, /^[a-f0-9-]{36}$/);
  assert.equal(body.requestId, r.headers.get("x-request-id"));
});

test("web login normalizes identity and sets HttpOnly same-site cookie without bearer credentials", async () => {
  const x = await login(" ADMIN@EXAMPLE.TEST ");
  assert.equal(x.r.status, 201);
  assert.match(x.r.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(x.r.headers.get("set-cookie")!, /SameSite=Lax/i);
  assert.equal(x.body.data.actor.role, "admin");
  assert.equal(x.body.data.accessToken, undefined);
  assert.equal(x.body.data.actor.passwordHash, undefined);
  assert.match(x.body.data.csrfToken, /^[a-f0-9]{64}$/);
});
test("credential failures are identical for invalid and missing users", async () => {
  const a = await request(
    "/auth/sessions",
    { email: "admin@example.test", password: "wrong", client: "web" },
    { origin: "http://localhost:3000" },
  );
  const b = await request(
    "/auth/sessions",
    { email: "absent@example.test", password: "wrong", client: "web" },
    { origin: "http://localhost:3000" },
  );
  assert.equal(a.r.status, 401);
  assert.equal(b.r.status, 401);
  assert.deepEqual(a.body.error, b.body.error);
});
test("disabled users cannot sign in", async () => {
  const x = await login("disabled@example.test");
  assert.equal(x.r.status, 401);
});
test("web login requires a trusted Origin", async () => {
  const x = await request("/auth/sessions", {
    email: "admin@example.test",
    password,
    client: "web",
  });
  assert.equal(x.r.status, 403);
  const y = await request(
    "/auth/sessions",
    { email: "admin@example.test", password, client: "native" },
    { origin: "https://evil.example" },
  );
  assert.equal(y.r.status, 403);
});
test("identity cannot be selected by actor or role body fields", async () => {
  const x = await request(
    "/auth/sessions",
    { email: "customer@example.test", password, client: "web", role: "admin" },
    { origin: "http://localhost:3000" },
  );
  assert.equal(x.r.status, 400);
});
test("session lookup works on another API instance and supplies CSRF after reload", async () => {
  const x = await login();
  const y = await request("/auth/me", undefined, webHeaders(x), secondBase);
  assert.equal(y.r.status, 200);
  assert.equal(y.body.data.actor.id, "admin@example.test");
  assert.equal(y.body.data.csrfToken, x.body.data.csrfToken);
});
test("cookie logout rejects absent or wrong CSRF and revoked cookie is unusable", async () => {
  const x = await login();
  const h = webHeaders(x);
  const { "x-csrf-token": unused, ...missing } = h;
  assert.equal((await request("/auth/logout", {}, missing)).r.status, 403);
  assert.equal(
    (await request("/auth/logout", {}, { ...h, "x-csrf-token": "bad" })).r
      .status,
    403,
  );
  assert.equal((await request("/auth/logout", {}, h)).r.status, 201);
  assert.equal(
    (await request("/auth/me", undefined, h, secondBase)).r.status,
    401,
  );
});
test("cookie mutations reject an untrusted origin despite valid CSRF", async () => {
  const x = await login();
  assert.equal(
    (
      await request(
        "/auth/logout",
        {},
        { ...webHeaders(x), origin: "https://evil.example" },
      )
    ).r.status,
    403,
  );
});
test("expired sessions and disabled identities lose access immediately", async () => {
  const x = await login("customer@example.test");
  const session = await db.session.findFirstOrThrow({
    where: { userId: "customer@example.test" },
    orderBy: { createdAt: "desc" },
  });
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (await request("/auth/me", undefined, webHeaders(x))).r.status,
    401,
  );
  const y = await login("customer@example.test");
  await db.user.update({
    where: { id: "customer@example.test" },
    data: { active: false },
  });
  assert.equal(
    (await request("/auth/me", undefined, webHeaders(y))).r.status,
    401,
  );
  await db.user.update({
    where: { id: "customer@example.test" },
    data: { active: true },
  });
});
test("native refresh rotates access and refresh secrets across instances", async () => {
  const x = await login("customer@example.test", "native");
  assert.equal(x.r.status, 201);
  assert.equal(x.r.headers.get("set-cookie"), null);
  const old = x.body.data;
  const y = await request(
    "/auth/refresh",
    { refreshToken: old.refreshToken },
    {},
    secondBase,
  );
  assert.equal(y.r.status, 201);
  assert.notEqual(y.body.data.accessToken, old.accessToken);
  assert.notEqual(y.body.data.refreshToken, old.refreshToken);
  assert.equal(
    (
      await request("/auth/me", undefined, {
        authorization: "Bearer " + old.accessToken,
      })
    ).r.status,
    401,
  );
  assert.equal(
    (
      await request("/auth/me", undefined, {
        authorization: "Bearer " + y.body.data.accessToken,
      })
    ).r.status,
    200,
  );
});
test("refresh reuse revokes the newly rotated family durably", async () => {
  const x = await login("customer@example.test", "native");
  const a = await request("/auth/refresh", {
    refreshToken: x.body.data.refreshToken,
  });
  assert.equal(a.r.status, 201);
  const b = await request(
    "/auth/refresh",
    { refreshToken: x.body.data.refreshToken },
    {},
    secondBase,
  );
  assert.equal(b.r.status, 401);
  assert.equal(
    (
      await request("/auth/me", undefined, {
        authorization: "Bearer " + a.body.data.accessToken,
      })
    ).r.status,
    401,
  );
});
test("simultaneous native refresh attempts fail closed", async () => {
  const x = await login("customer@example.test", "native");
  const results = await Promise.all([
    request("/auth/refresh", { refreshToken: x.body.data.refreshToken }),
    request(
      "/auth/refresh",
      { refreshToken: x.body.data.refreshToken },
      {},
      secondBase,
    ),
  ]);
  assert.deepEqual(results.map((x) => x.r.status).sort(), [201, 401]);
  const good = results.find((x) => x.r.status === 201)!;
  assert.equal(
    (
      await request("/auth/me", undefined, {
        authorization: "Bearer " + good.body.data.accessToken,
      })
    ).r.status,
    401,
  );
});
test("tokens and passwords are never stored in plaintext", async () => {
  const x = await login("customer@example.test", "native");
  const rows = JSON.stringify(await db.session.findMany());
  assert.ok(!rows.includes(x.body.data.accessToken));
  assert.ok(!rows.includes(x.body.data.refreshToken));
  assert.ok(
    !(
      await db.user.findUniqueOrThrow({ where: { id: "admin@example.test" } })
    ).passwordHash.includes(password),
  );
});
test("login throttle is durable across API instances", async () => {
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await request(
          "/auth/sessions",
          {
            email: "throttle@example.test",
            password: "wrong",
            client: "native",
          },
          {},
          i % 2 ? secondBase : base,
        )
      ).r.status,
      401,
    );
  assert.equal(
    (await login("throttle@example.test", "native", secondBase)).r.status,
    429,
  );
});

test("expired native access requires refresh while logout revokes the whole family", async () => {
  const x = await login("customer@example.test", "native");
  assert.equal(x.r.status, 201);
  const session = await db.session.findFirstOrThrow({
    where: {
      userId: "customer@example.test",
      currentRefreshHash: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  await db.session.update({
    where: { id: session.id },
    data: { accessExpiresAt: new Date(0) },
  });
  assert.equal(
    (
      await request("/auth/me", undefined, {
        authorization: "Bearer " + x.body.data.accessToken,
      })
    ).r.status,
    401,
  );
  const y = await request("/auth/refresh", {
    refreshToken: x.body.data.refreshToken,
  });
  assert.equal(y.r.status, 201);
  assert.equal(
    (
      await request(
        "/auth/logout",
        {},
        { authorization: "Bearer " + y.body.data.accessToken },
      )
    ).r.status,
    201,
  );
  assert.equal(
    (await request("/auth/refresh", { refreshToken: y.body.data.refreshToken }))
      .r.status,
    401,
  );
});

test("persistent catalogue honors publication, category, variant and exact availability", async () => {
  const x = await request("/catalog/products");
  assert.equal(x.r.status, 200);
  const data = shopPageDataSchema.parse(x.body.data);
  assert.equal(data.total, 1);
  assert.deepEqual(
    data.items.map((x) => x.id),
    ["rice"],
  );
  assert.equal(data.items[0].variants[0].availableToSell, "7");
  assert.equal(data.items[0].variants.length, 1);
  assert.equal(data.items[0].minPriceMinor, 1250);
  assert.match(data.items[0].minPriceLabel, /₵/);
});
test("public detail exposes out-of-stock products but hides unpublished/inactive categories", async () => {
  const x = await request("/catalog/products/salt");
  assert.equal(x.r.status, 200);
  assert.equal(
    catalogProductSchema.parse(x.body.data.product).anyAvailable,
    false,
  );
  assert.equal(x.body.data.purchasable, false);
  for (const id of ["hidden", "inactive-category", "missing"])
    assert.equal((await request("/catalog/products/" + id)).r.status, 404);
});
test("catalogue paging rejects invalid inputs and safely handles search", async () => {
  for (const query of [
    "page=0",
    "page=banana",
    "perPage=101",
    "page=99999999999999999",
    "sort=unknown",
  ])
    assert.equal((await request("/catalog/products?" + query)).r.status, 400);
  const x = await request(
    "/catalog/products?q=" + encodeURIComponent("'; DROP TABLE User; --"),
  );
  assert.equal(x.r.status, 200);
  assert.equal(x.body.data.total, 0);
  const y = await request(
    "/catalog/products?q=RICE&category=cat_food&sort=price-asc&perPage=1",
  );
  assert.equal(y.body.data.total, 1);
});
test("catalogue categories and home share availability and omit prototype tracking", async () => {
  const c = await request("/catalog/categories");
  assert.equal(c.r.status, 200);
  assert.deepEqual(
    c.body.data.map((x: { id: string }) => x.id),
    ["cat_food"],
  );
  assert.equal(c.body.data[0].availableProducts, 1);
  const h = await request("/catalog/home");
  assert.equal(h.r.status, 200);
  assert.equal(h.body.data.demoTrack, undefined);
  assert.equal(h.body.data.categories[0].count, 1);
});
test("variant resolution cannot reveal unpublished products or inactive variants", async () => {
  const x = await request("/catalog/products:by-variants", {
    variantIds: [
      "var_rice",
      "var_rice",
      "var_hidden",
      "var_disabled",
      "var_inactive-category",
    ],
  });
  assert.equal(x.r.status, 201);
  assert.deepEqual(
    x.body.data.map((x: { id: string }) => x.id),
    ["rice"],
  );
  assert.equal(
    (await request("/catalog/products:by-variants", { variantIds: [] })).r
      .status,
    400,
  );
});
test("inventory reads require role and location grants", async () => {
  assert.equal((await request("/inventory/overview")).r.status, 401);
  const c = await login("customer@example.test", "native");
  assert.equal(
    (
      await request("/inventory/overview", undefined, {
        authorization: "Bearer " + c.body.data.accessToken,
      })
    ).r.status,
    403,
  );
  const w = await login("warehouse@example.test", "native");
  const headers = { authorization: "Bearer " + w.body.data.accessToken };
  const x = await request(
    "/inventory/overview?locationId=loc_accra",
    undefined,
    headers,
  );
  assert.equal(x.r.status, 200);
  assert.equal(
    x.body.data.rows.find(
      (r: { variantId: string }) => r.variantId === "var_rice",
    ).availableToSell,
    "7",
  );
  assert.equal(
    (
      await request(
        "/inventory/overview?locationId=loc_kumasi",
        undefined,
        headers,
      )
    ).r.status,
    403,
  );
});
test("lot-specific reservations are durable, constrained and reflected in availability", async () => {
  const w = await login("warehouse@example.test", "native");
  const headers = { authorization: "Bearer " + w.body.data.accessToken };
  await db.$executeRaw`INSERT INTO "Reservation"
    (id,"positionId","lotId","claimType","claimId","claimLineId",quantity,state,"expiresAt","createdAt")
    VALUES ('res_task1','pos_rice','lot_rice','order','ord_task1','line_task1',0.5,'active',${new Date(Date.now() + 3600000)},now())`;
  const held = await request(
    "/inventory/overview?locationId=loc_accra",
    undefined,
    headers,
  );
  assert.equal(
    held.body.data.rows.find(
      (r: { variantId: string }) => r.variantId === "var_rice",
    ).availableToSell,
    "6.5",
  );
  await db.$executeRaw`UPDATE "Reservation" SET state='released' WHERE id='res_task1'`;
  const released = await request(
    "/inventory/overview?locationId=loc_accra",
    undefined,
    headers,
  );
  assert.equal(
    released.body.data.rows.find(
      (r: { variantId: string }) => r.variantId === "var_rice",
    ).availableToSell,
    "7",
  );
  await assert.rejects(() =>
    db.$executeRaw`INSERT INTO "Reservation"
      (id,"positionId","lotId","claimType","claimId","claimLineId",quantity,state,"expiresAt","createdAt")
      VALUES ('res_zero','pos_rice','lot_rice','order','ord_zero','line_zero',0,'active',${new Date(Date.now() + 3600000)},now())`,
  );
  await assert.rejects(() =>
    db.$executeRaw`INSERT INTO "Reservation"
      (id,"positionId","lotId","claimType","claimId","claimLineId",quantity,state,"expiresAt","createdAt")
      VALUES ('res_bad_state','pos_rice','lot_rice','order','ord_bad','line_bad',1,'invalid',${new Date(Date.now() + 3600000)},now())`,
  );
  await assert.rejects(() =>
    db.$executeRaw`INSERT INTO "Reservation"
      (id,"positionId","lotId","claimType","claimId","claimLineId",quantity,state,"expiresAt","createdAt")
      VALUES ('res_duplicate','pos_rice','lot_rice','order','ord_task1','line_task1',1,'active',${new Date(Date.now() + 3600000)},now())`,
  );
});
test("reservation provenance rejects a lot from another stock position", async () => {
  await assert.rejects(() =>
    db.$executeRaw`INSERT INTO "Reservation"
      (id,"positionId","lotId","claimType","claimId","claimLineId",quantity,state,"expiresAt","createdAt")
      VALUES ('res_wrong_position','pos_salt','lot_rice','order','ord_wrong_position','line_wrong_position',1,'active',${new Date(Date.now() + 3600000)},now())`,
  );
});
test("reservation provenance rejects unsupported claim types", async () => {
  await assert.rejects(() =>
    db.$executeRaw`INSERT INTO "Reservation"
      (id,"positionId","lotId","claimType","claimId","claimLineId",quantity,state,"expiresAt","createdAt")
      VALUES ('res_bad_claim_type','pos_rice','lot_rice','other','ord_bad_claim_type','line_bad_claim_type',1,'active',${new Date(Date.now() + 3600000)},now())`,
  );
});
test("native grant changes are enforced on the next request", async () => {
  const w = await login("warehouse@example.test", "native");
  const headers = { authorization: "Bearer " + w.body.data.accessToken };
  await db.userLocation.delete({
    where: {
      userId_locationId: {
        userId: "warehouse@example.test",
        locationId: "loc_accra",
      },
    },
  });
  assert.equal(
    (await request("/inventory/overview", undefined, headers)).r.status,
    403,
  );
  await db.userLocation.create({
    data: { userId: "warehouse@example.test", locationId: "loc_accra" },
  });
});
test("receiving validates the entire payload before any stock changes", async () => {
  const x = await login();
  const h = { ...webHeaders(x), "idempotency-key": "invalid-lines-test" };
  const before = await db.stockLot.count();
  const response = await request(
    "/inventory/receive",
    {
      lines: [
        { variantId: "var_rice", quantity: "1" },
        { variantId: "var_missing", quantity: "1" },
      ],
    },
    h,
  );
  assert.equal(response.r.status, 404);
  assert.equal(await db.stockLot.count(), before);
  assert.equal(await db.stockReceipt.count(), 0);
  assert.equal(await db.outboxEvent.count(), 0);
});
test("receiving rejects negative/overprecise quantities, impossible dates and missing replay keys", async () => {
  const x = await login();
  const h = { ...webHeaders(x), "idempotency-key": "invalid-request-test" };
  for (const line of [
    { variantId: "var_rice", quantity: "-1" },
    { variantId: "var_rice", quantity: "0" },
    { variantId: "var_rice", quantity: "1.0001" },
    { variantId: "var_rice", quantity: "1", expiryDate: "2026-02-30" },
  ])
    assert.equal(
      (await request("/inventory/receive", { lines: [line] }, h)).r.status,
      400,
    );
  assert.equal(
    (
      await request(
        "/inventory/receive",
        { lines: [{ variantId: "var_rice", quantity: "1" }] },
        webHeaders(x),
      )
    ).r.status,
    400,
  );
});
test("ungranted and inactive receiving locations leave no partial receipt", async () => {
  const w = await login("warehouse@example.test", "native");
  const h = {
    authorization: "Bearer " + w.body.data.accessToken,
    "idempotency-key": "scope-receive-test",
  };
  assert.equal(
    (
      await request(
        "/inventory/receive",
        {
          lines: [
            { variantId: "var_rice", quantity: "1", location: "loc_accra" },
            { variantId: "var_rice", quantity: "1", location: "loc_kumasi" },
          ],
        },
        h,
      )
    ).r.status,
    403,
  );
  const a = await login();
  assert.equal(
    (
      await request(
        "/inventory/receive",
        {
          lines: [
            { variantId: "var_rice", quantity: "1", location: "loc_inactive" },
          ],
        },
        { ...webHeaders(a), "idempotency-key": "inactive-receive-test" },
      )
    ).r.status,
    409,
  );
  assert.equal(await db.stockReceipt.count(), 0);
});
test("two instances replay one atomic stock receipt and reject changed input", async () => {
  const x = await login();
  const h = { ...webHeaders(x), "idempotency-key": "concurrent-receipt-test" };
  const body = {
    actor: "forged-admin",
    note: "purchase",
    lines: [
      {
        variantId: "var_rice",
        quantity: "1.375",
        lotNumber: "fresh",
        expiryDate: "2099-01-01",
        unitCostMinor: 800,
      },
    ],
  };
  const results = await Promise.all([
    request("/inventory/receive", body, h),
    request("/inventory/receive", body, h, secondBase),
  ]);
  assert.deepEqual(
    results.map((x) => x.r.status),
    [201, 201],
  );
  assert.equal(results[0].body.data.receiptId, results[1].body.data.receiptId);
  assert.equal(await db.stockReceipt.count(), 1);
  assert.equal(await db.stockMovement.count(), 1);
  assert.equal(await db.outboxEvent.count(), 1);
  assert.equal(
    await db.auditEvent.count({ where: { action: "inventory.received" } }),
    1,
  );
  const movement = await db.stockMovement.findFirstOrThrow();
  assert.equal(movement.actorId, "admin@example.test");
  assert.equal(movement.delta.toString(), "1.375");
  assert.equal(
    (
      await request(
        "/inventory/receive",
        { ...body, lines: [{ ...body.lines[0], quantity: "2" }] },
        h,
      )
    ).r.status,
    409,
  );
  const product = await request("/catalog/products/rice");
  assert.equal(product.body.data.product.variants[0].availableToSell, "8.375");
});
test("stock history is append-only and negative lot quantities are rejected in PostgreSQL", async () => {
  const movement = await db.stockMovement.findFirstOrThrow();
  await assert.rejects(
    db.stockMovement.update({
      where: { id: movement.id },
      data: { reason: "rewrite" },
    }),
  );
  await assert.rejects(db.stockMovement.delete({ where: { id: movement.id } }));
  await assert.rejects(
    db.stockLot.update({ where: { id: "lot_rice" }, data: { quantity: "-1" } }),
  );
  const audit = await db.auditEvent.findFirstOrThrow();
  await assert.rejects(db.auditEvent.delete({ where: { id: audit.id } }));
});
test("receipts and availability survive replacing the API process", async () => {
  const receipt = await db.stockReceipt.findFirstOrThrow();
  await second.close();
  second = await createApplication();
  await second.listen(0, "127.0.0.1");
  secondBase = await second.getUrl();
  const x = await request("/catalog/products/rice", undefined, {}, secondBase);
  assert.equal(x.body.data.product.variants[0].availableToSell, "8.375");
  assert.ok(
    await second
      .get(Database)
      .stockReceipt.findUnique({ where: { id: receipt.id } }),
  );
});

test("piece-counted variants reject fractional receiving quantities", async () => {
  const x = await login();
  const before = await db.stockReceipt.count();
  const y = await request(
    "/inventory/receive",
    { lines: [{ variantId: "var_salt", quantity: "1.5" }] },
    { ...webHeaders(x), "idempotency-key": "piece-increment-test" },
  );
  assert.equal(y.r.status, 400);
  assert.equal(await db.stockReceipt.count(), before);
});
test("a database outbox failure rolls back all receiving effects", async () => {
  const x = await login();
  const counts = await Promise.all([
    db.stockLot.count(),
    db.stockMovement.count(),
    db.stockReceipt.count(),
    db.idempotency.count(),
    db.auditEvent.count({ where: { action: "inventory.received" } }),
  ]);
  await db.$executeRawUnsafe(
    "CREATE FUNCTION test_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test outbox fault'; END; $$",
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER test_outbox_failure BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_outbox()',
  );
  try {
    const y = await request(
      "/inventory/receive",
      { lines: [{ variantId: "var_rice", quantity: "1" }] },
      { ...webHeaders(x), "idempotency-key": "outbox-failure-test" },
    );
    assert.equal(y.r.status, 500);
    assert.deepEqual(
      await Promise.all([
        db.stockLot.count(),
        db.stockMovement.count(),
        db.stockReceipt.count(),
        db.idempotency.count(),
        db.auditEvent.count({ where: { action: "inventory.received" } }),
      ]),
      counts,
    );
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER test_outbox_failure ON "OutboxEvent"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION test_reject_outbox()");
  }
});
test("malformed JSON and oversized bodies fail safely", async () => {
  const x = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(x.status, 400);
  assert.equal((await x.json()).error.code, "VALIDATION_FAILED");
  const y = await request("/auth/sessions", { payload: "x".repeat(65536) });
  assert.equal(y.r.status, 413);
  assert.equal(y.body.error.code, "VALIDATION_FAILED");
});

test("foundation OpenAPI describes only implemented routes with cookie/native security", async () => {
  const r = await fetch(base + "/api/v1/openapi.json");
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(Object.keys(d.paths).length, 21);
  assert.ok(d.paths["/api/v1/checkout/complete"]);
  assert.deepEqual(d.paths["/api/v1/inventory/receive"].post.security, [
    { cookieAuth: [] },
    { bearerAuth: [] },
  ]);
  assert.ok(
    d.paths["/api/v1/catalog/products"].get.responses["200"].content[
      "application/json"
    ].schema.$ref,
  );
});

test("different receipt keys concurrently create one new stock position without failures", async () => {
  const x = await login();
  for (let round = 0; round < 3; round++) {
    const variantId = `first_receive_${round}`;
    await db.variant.create({
      data: {
        id: variantId,
        sku: variantId,
        productId: "rice",
        name: variantId,
        unit: "kg",
        priceMinor: 100,
      },
    });
    const before = await db.stockReceipt.count();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(
          "/inventory/receive",
          { lines: [{ variantId, quantity: "1.125" }] },
          {
            ...webHeaders(x),
            "idempotency-key": `first-position-${round}-${i}`,
          },
          i % 2 ? secondBase : base,
        ),
      ),
    );
    assert.deepEqual(
      results.map((r) => r.r.status),
      Array(8).fill(201),
    );
    assert.equal(new Set(results.map((r) => r.body.data.receiptId)).size, 8);
    assert.equal(await db.stockReceipt.count(), before + 8);
    const positions = await db.stockPosition.findMany({
      where: { variantId, locationId: "loc_accra" },
      include: { lots: true },
    });
    assert.equal(positions.length, 1);
    assert.equal(positions[0].lots.length, 8);
    const overview = await request(
      "/inventory/overview",
      undefined,
      webHeaders(x),
    );
    assert.equal(
      overview.body.data.rows.find(
        (r: { variantId: string }) => r.variantId === variantId,
      ).availableToSell,
      "9",
    );
  }
});

test("variant resolution accepts only its literal documented command path", async () => {
  assert.equal(
    (
      await request("/catalog/productsfake-variants", {
        variantIds: ["var_rice"],
      })
    ).r.status,
    404,
  );
  assert.equal(
    (
      await request("/catalog/products:by-variants", {
        variantIds: ["var_rice"],
      })
    ).r.status,
    201,
  );
});

test("foundation OpenAPI defines complete response data and inventory location selection", async () => {
  const d = await (await fetch(base + "/api/v1/openapi.json")).json();
  function resolve(schema: any): any {
    return schema.$ref
      ? resolve(
          schema.$ref
            .split("/")
            .slice(1)
            .reduce((obj: any, key: string) => obj[key], d),
        )
      : schema;
  }
  for (const [path, item] of Object.entries(d.paths) as [string, any][]) {
    for (const method of ["get", "post"]) {
      const op = item[method];
      if (!op) continue;
      const response = resolve(
        op.responses[method === "post" && !["/api/v1/checkout/quote","/api/v1/orders/track","/api/v1/account/orders/{orderId}/cancel"].includes(path) ? "201" : "200"].content[
          "application/json"
        ].schema,
      );
      const data = resolve(response.properties.data);
      assert.ok(
        data.type || data.oneOf,
        `${method} ${path} needs a concrete response data schema`,
      );
    }
  }
  const overview = d.paths["/api/v1/inventory/overview"].get;
  assert.deepEqual(overview.parameters.map((p: any) => p.name).sort(), [
    "locationId",
    "page",
    "perPage",
  ]);
  const login = d.paths["/api/v1/auth/sessions"].post;
  const loginData = resolve(
    resolve(login.responses["201"].content["application/json"].schema)
      .properties.data,
  );
  assert.equal(loginData.oneOf.length, 2);
  const variants = loginData.oneOf.map(resolve);
  assert.ok(variants.some((s: any) => s.required.includes("csrfToken")));
  assert.ok(
    variants.some(
      (s: any) =>
        s.required.includes("refreshToken") &&
        s.required.includes("accessToken"),
    ),
  );
});

test("owner admins can access active business locations without staff grants", async () => {
  const x = await login();
  assert.equal(x.body.data.actor.locationIds.length, 0);
  assert.equal(
    (
      await request(
        "/inventory/overview?locationId=loc_kumasi",
        undefined,
        webHeaders(x),
      )
    ).r.status,
    200,
  );
});

test("web/native identity, catalogue and inventory conform to shared response schemas", async () => {
  const web = await login();
  assert.ok(webSessionResponseSchema.safeParse(web.body.data).success);
  const native = await login("admin@example.test", "native");
  assert.ok(nativeSessionResponseSchema.safeParse(native.body.data).success);
  const me = await request("/auth/me", undefined, webHeaders(web));
  assert.ok(sessionLookupResponseSchema.safeParse(me.body.data).success);
  const refresh = await request("/auth/refresh", {
    refreshToken: native.body.data.refreshToken,
  });
  assert.ok(nativeSessionResponseSchema.safeParse(refresh.body.data).success);
  const home = await request("/catalog/home");
  assert.ok(foundationHomeSchema.safeParse(home.body.data).success);
  const categories = await request("/catalog/categories");
  for (const row of categories.body.data)
    assert.ok(foundationCategorySchema.safeParse(row).success);
  const detail = await request("/catalog/products/rice");
  assert.ok(foundationProductDetailSchema.safeParse(detail.body.data).success);
  const inventory = await request(
    "/inventory/overview",
    undefined,
    webHeaders(web),
  );
  assert.ok(
    foundationInventoryOverviewSchema.safeParse(inventory.body.data).success,
  );
});
