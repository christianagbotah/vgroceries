import { expect, test } from "bun:test";
import { createTrackingRequestCoordinator, isTrackingTerminal } from "../src/features/orders/tracking-requests";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const values: string[] = [];
  const errors: unknown[] = [];
  const phases: string[] = [];
  const requests = createTrackingRequestCoordinator<string>({
    onStart: () => phases.push("start"), onValue: value => values.push(value),
    onError: error => errors.push(error), onFinish: () => phases.push("finish"),
  });
  return { requests, values, errors, phases };
}

test("slow tracking requests cannot overlap a poll or manual refresh", async () => {
  const x = harness(); const pending = deferred<string>(); let calls = 0;
  const first = x.requests.load(() => { calls++; return pending.promise; });
  await x.requests.load(async () => { calls++; return "stale overlap"; });
  expect(calls).toBe(1);
  pending.resolve("latest"); await first;
  expect(x.values).toEqual(["latest"]);
  expect(x.phases).toEqual(["start", "finish"]);
});

test("a superseded refresh cannot overwrite a newer terminal order response", async () => {
  const x = harness(); const old = deferred<string>(); const next = deferred<string>();
  const first = x.requests.load(() => old.promise);
  const second = x.requests.load(() => next.promise, { replace: true });
  next.resolve("delivered"); await second;
  old.resolve("preparing"); await first;
  expect(x.values).toEqual(["delivered"]);
  expect(x.phases).toEqual(["start", "start", "finish"]);
});

test("changing order identity or unmounting invalidates outstanding responses and errors", async () => {
  const x = harness(); const old = deferred<string>();
  const first = x.requests.load(() => old.promise);
  x.requests.invalidate();
  await x.requests.load(async () => "different order");
  old.reject(new Error("old order unavailable")); await first;
  expect(x.values).toEqual(["different order"]);
  expect(x.errors).toEqual([]);
  const detached = deferred<string>(); const pending = x.requests.load(() => detached.promise);
  x.requests.invalidate(); detached.resolve("unmounted order"); await pending;
  expect(x.values).toEqual(["different order"]);
});

test("a failed current request reports its error once and permits a safe retry", async () => {
  const x = harness(); const failure = new Error("temporarily unavailable");
  await x.requests.load(async () => { throw failure; });
  await x.requests.load(async () => "recovered");
  expect(x.errors).toEqual([failure]);
  expect(x.values).toEqual(["recovered"]);
  expect(x.phases).toEqual(["start", "finish", "start", "finish"]);
});

test("legacy terminal orders stop polling even without the optional journey", () => {
  for (const fulfilmentStatus of ["delivered", "collected", "cancelled"] as const) {
    expect(isTrackingTerminal({ fulfilmentStatus })).toBe(true);
  }
  expect(isTrackingTerminal({ fulfilmentStatus: "picking" })).toBe(false);
});
