/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { handleApi } from "../src/services/mock/router";
import { getStore, resetStore } from "../src/services/mock/store";

const query = (values: Record<string, string> = {}) => new URLSearchParams(values);
const read = (path: string) => readFileSync(path, "utf8");

async function op(path: string, body: Record<string, unknown> = {}, queryValues: Record<string, string> = {}) {
  return handleApi({ path, method: Object.keys(body).length ? "POST" : "GET", query: query(queryValues), body });
}

function data<T>(result: Awaited<ReturnType<typeof op>>) {
  expect(result.status).toBe(200);
  return (result.json as { ok: true; data: T }).data;
}

beforeEach(() => resetStore());

describe("CMS mock authority", () => {
  test("homepage draft remains private until publish promotes it", async () => {
    const initial = data<{ headline: string }>(await op("content.homepage"));
    expect(initial.headline).toBeTruthy();

    data(await op("admin.content.homepage.update", {
      headline: "A new draft headline",
      actor: "stf_ama",
    }));

    const stillPublic = data<{ headline: string }>(await op("content.homepage"));
    expect(stillPublic.headline).toBe(initial.headline);

    data(await op("admin.content.homepage.publish", { actor: "stf_ama" }));
    const published = data<{ headline: string }>(await op("content.homepage"));
    expect(published.headline).toBe("A new draft headline");
  });

  test("content page draft remains private until publish", async () => {
    const initial = data<{ title: string }>(await op("content.page", {}, { slug: "privacy" }));
    data(await op("admin.content.page.update", {
      slug: "privacy",
      title: "Privacy notice draft",
      actor: "stf_ama",
    }));
    expect(data<{ title: string }>(await op("content.page", {}, { slug: "privacy" })).title).toBe(initial.title);
    data(await op("admin.content.page.publish", { slug: "privacy", actor: "stf_ama" }));
    expect(data<{ title: string }>(await op("content.page", {}, { slug: "privacy" })).title).toBe("Privacy notice draft");
  });

  test("invalid page slug is rejected without changing seeded pages", async () => {
    const before = JSON.stringify(getStore().cms);
    const result = await op("admin.content.page.update", { slug: "not-a-page", title: "Wrong", actor: "stf_ama" });
    expect(result.status).toBe(400);
    expect(JSON.stringify(getStore().cms)).toBe(before);
  });

  test("publish rejects blank required copy", async () => {
    data(await op("admin.content.homepage.update", { headline: "   ", actor: "stf_ama" }));
    expect((await op("admin.content.homepage.publish", { actor: "stf_ama" })).status).toBe(400);

    data(await op("admin.content.page.update", { slug: "terms", title: "   ", actor: "stf_ama" }));
    expect((await op("admin.content.page.publish", { slug: "terms", actor: "stf_ama" })).status).toBe(400);
  });

  test("draft saves and publishes are audit logged", async () => {
    const before = getStore().audit.length;
    data(await op("admin.content.page.update", { slug: "help", intro: "Updated help intro", actor: "stf_ama" }));
    data(await op("admin.content.page.publish", { slug: "help", actor: "stf_ama" }));
    const events = getStore().audit.slice(0, getStore().audit.length - before + 4).filter((event) => event.entity === "CmsContentPage");
    expect(events.some((event) => event.action === "cms.page_draft_saved")).toBe(true);
    expect(events.some((event) => event.action === "cms.page_published")).toBe(true);
  });
});

describe("CMS admin surfaces", () => {
  test("admin shell exposes owner-gated CMS navigation and storefront preview", () => {
    const shell = read("src/components/layout/admin-shell.tsx");
    expect(shell).toContain("Storefront CMS");
    expect(shell).toContain('href: "/admin/content"');
    expect(shell).toContain('href: "/admin/content/homepage"');
    expect(shell).toContain('permission: "settings.manage"');
    expect(shell).toContain('href="/"');
    expect(shell).toContain("View storefront");
  });

  test("CMS overview and editors exist with explicit draft and publish actions", () => {
    for (const path of [
      "src/app/admin/content/page.tsx",
      "src/app/admin/content/homepage/page.tsx",
      "src/app/admin/content/pages/[slug]/page.tsx",
      "src/features/cms/homepage-editor.tsx",
      "src/features/cms/content-page-editor.tsx",
    ]) expect(existsSync(path)).toBe(true);

    const homepageEditor = read("src/features/cms/homepage-editor.tsx");
    const pageEditor = read("src/features/cms/content-page-editor.tsx");
    expect(homepageEditor).toContain("Save draft");
    expect(homepageEditor).toContain("Publish");
    expect(pageEditor).toContain("Save draft");
    expect(pageEditor).toContain("Publish");
  });
});

describe("published storefront CMS integration", () => {
  test("homepage and policy pages read published CMS content through server-data", () => {
    const home = read("src/app/(storefront)/page.tsx");
    const help = read("src/app/(storefront)/help/page.tsx");
    const returnsPolicy = read("src/app/(storefront)/returns-policy/page.tsx");
    const privacy = read("src/app/(storefront)/privacy/page.tsx");
    const terms = read("src/app/(storefront)/terms/page.tsx");
    const serverData = read("src/services/server-data.ts");
    expect(serverData).toContain("getCmsHomepage");
    expect(serverData).toContain("getCmsContentPage");
    expect(home).toContain("getCmsHomepage");
    for (const source of [help, returnsPolicy, privacy, terms]) expect(source).toContain("CmsInfoPage");
  });
});
