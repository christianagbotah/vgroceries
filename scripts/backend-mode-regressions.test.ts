/// <reference types="bun-types" />
import { afterEach, beforeEach, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { resolveServerAdapter } from "../src/services/adapters/server";
import { GET, POST } from "../src/app/api/mock/v1/[...path]/route";
import { getStore, resetStore } from "../src/services/mock/store";
const oldAPI = process.env.API_BASE_URL;
const oldPublic = process.env.NEXT_PUBLIC_API_BASE_URL;
beforeEach(() => { resetStore(); delete process.env.API_BASE_URL; delete process.env.NEXT_PUBLIC_API_BASE_URL; });
afterEach(() => {
  if (oldAPI === undefined) delete process.env.API_BASE_URL; else process.env.API_BASE_URL = oldAPI;
  if (oldPublic === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = oldPublic;
  resetStore();
});
test("one configured backend URL cannot silently leave the other renderer on mock data", () => {
  process.env.API_BASE_URL = "http://127.0.0.1:4000/api/v1";
  expect(resolveServerAdapter).toThrow("Configure both");
});
test("live backend mode does not expose mock reads", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:4000/api/v1";
  const response = await GET(new NextRequest("http://localhost/api/mock/v1/catalog/list"), { params: Promise.resolve({ path: ["catalog", "list"] }) });
  expect(response.status).toBe(404);
});
test("live backend mode rejects demo reset before mutating the store", async () => {
  process.env.API_BASE_URL = "http://127.0.0.1:4000/api/v1";
  const store = getStore();
  store.products[0].name = "Unchanged state marker";
  const response = await POST(new NextRequest("http://localhost/api/mock/v1/demo/reset", { method: "POST", body: "{}" }), { params: Promise.resolve({ path: ["demo", "reset"] }) });
  expect(response.status).toBe(404);
  expect(getStore()).toBe(store);
  expect(getStore().products[0].name).toBe("Unchanged state marker");
});
