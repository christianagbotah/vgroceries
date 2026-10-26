import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";

let app: INestApplication;
let db: Database;
let base = "";
const fixtureSecret = "Verified-cms-test-2026";
function fixtureHash() {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$1$${salt}$${scryptSync(fixtureSecret, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
}
function config() {
  return readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true" });
}
async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(base + "/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() };
}
async function login(email: string) {
  const result = await request("/auth/sessions", { email, password: fixtureSecret, client: "web" }, { origin: "http://localhost:3000" });
  assert.equal(result.response.status, 201);
  return { cookie: result.response.headers.get("set-cookie")!.split(";")[0], origin: "http://localhost:3000", "x-csrf-token": result.body.data.csrfToken };
}
before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("CMS authority tests require the isolated variety_foundation_test database");
  app = await createApplication(config()); await app.listen(0, "127.0.0.1"); base = await app.getUrl(); db = app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "User", "AuditEvent", "LoginThrottle" CASCADE');
  await db.$executeRawUnsafe('UPDATE "CmsContent" SET "draft" = "published"');
  for (const [email, role] of [["admin-cms@example.test", "admin"], ["inventory-cms@example.test", "inventory_manager"], ["customer-cms@example.test", "customer"]] as const)
    await db.user.create({ data: { id: email, email, name: email, passwordHash: fixtureHash(), role } });
});
after(async () => { await app?.close(); });

test("published CMS content is public and bounded to known storefront surfaces", async () => {
  const homepage = await request("/content/homepage");
  assert.equal(homepage.response.status, 200); assert.equal(homepage.body.ok, true); assert.equal(typeof homepage.body.data.headline, "string"); assert.ok(homepage.body.data.headline.length > 0);
  const privacy = await request("/content/pages/privacy");
  assert.equal(privacy.response.status, 200); assert.equal(privacy.body.data.slug, "privacy"); assert.ok(Array.isArray(privacy.body.data.sections));
  const unknown = await request("/content/pages/not-a-page"); assert.equal(unknown.response.status, 404); assert.equal(unknown.body.error.code, "NOT_FOUND");
});

test("CMS administration is authenticated admin-only", async () => {
  assert.equal((await request("/admin/content")).response.status, 401);
  for (const email of ["inventory-cms@example.test", "customer-cms@example.test"]) assert.equal((await request("/admin/content", undefined, await login(email))).response.status, 403);
  const allowed = await request("/admin/content", undefined, await login("admin-cms@example.test")); assert.equal(allowed.response.status, 200); assert.equal(allowed.body.data.pages.length, 4);
});

test("draft saves stay private until explicit publish and server owns the audit actor", async () => {
  const admin = await login("admin-cms@example.test"); const before = await request("/content/homepage"); const draftHeadline = `Persistent CMS ${Date.now()}`;
  const spoofed = await request("/admin/content/homepage/draft", { ...before.body.data, headline: draftHeadline, actor: "spoofed-browser-actor" }, admin); assert.equal(spoofed.response.status, 400);
  const cleanSaved = await request("/admin/content/homepage/draft", { ...before.body.data, headline: draftHeadline }, admin);
  assert.equal(cleanSaved.response.status, 200); assert.equal(cleanSaved.body.data.draft.headline, draftHeadline); assert.equal(cleanSaved.body.data.hasUnpublishedChanges, true);
  assert.equal((await request("/content/homepage")).body.data.headline, before.body.data.headline);
  const published = await request("/admin/content/homepage/publish", {}, admin); assert.equal(published.response.status, 200); assert.equal(published.body.data.hasUnpublishedChanges, false);
  assert.equal((await request("/content/homepage")).body.data.headline, draftHeadline);
  const audit = await db.auditEvent.findMany({ where: { entityId: "homepage", action: { in: ["cms.homepage_draft_saved", "cms.homepage_published"] } }, orderBy: { createdAt: "desc" }, take: 2 });
  assert.equal(audit.length, 2); assert.ok(audit.every((event) => event.actorId === "admin-cms@example.test"));
});

test("publishing canonicalizes the draft so no phantom unpublished change remains", async () => {
  const admin = await login("admin-cms@example.test");
  const current = await request("/admin/content/homepage", undefined, admin);
  const saved = await request("/admin/content/homepage/draft", {
    ...current.body.data.draft,
    headline: "  Canonical homepage headline  ",
    body: "  Canonical homepage body  ",
  }, admin);
  assert.equal(saved.response.status, 200);
  const published = await request("/admin/content/homepage/publish", {}, admin);
  assert.equal(published.response.status, 200);
  assert.equal(published.body.data.hasUnpublishedChanges, false);
  assert.deepEqual(published.body.data.draft, published.body.data.published);
});

test("structured page publishing validates content and preserves draft/published separation", async () => {
  const admin = await login("admin-cms@example.test"); const page = await request("/admin/content/pages/terms", undefined, admin); assert.equal(page.response.status, 200); const publishedTitle = page.body.data.published.title;
  const saved = await request("/admin/content/pages/terms/draft", { title: "Terms draft from production CMS", intro: page.body.data.published.intro, sections: page.body.data.published.sections }, admin); assert.equal(saved.response.status, 200);
  assert.equal((await request("/content/pages/terms")).body.data.title, publishedTitle);
  const incompleteDraft = await request("/admin/content/pages/terms/draft", { title: "", intro: "", sections: [{ heading: "", body: "" }] }, admin); assert.equal(incompleteDraft.response.status, 200);
  const rejectedPublish = await request("/admin/content/pages/terms/publish", {}, admin); assert.equal(rejectedPublish.response.status, 400);
  const restored = await request("/admin/content/pages/terms/draft", { title: "Terms draft from production CMS", intro: page.body.data.published.intro, sections: page.body.data.published.sections }, admin); assert.equal(restored.response.status, 200);
  const published = await request("/admin/content/pages/terms/publish", {}, admin); assert.equal(published.response.status, 200); assert.equal((await request("/content/pages/terms")).body.data.title, "Terms draft from production CMS");
});
