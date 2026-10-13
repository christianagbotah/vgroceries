import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiProblem } from "../src/http/errors";
import {
  dispatchCommandHash,
  normalizeDispatchNote,
  normalizeFailureReason,
  normalizeProof,
  validateDispatchContext,
} from "../src/dispatch/dispatch.values";

function problem(fn: () => unknown, code = "VALIDATION_FAILED") {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ApiProblem);
    assert.equal((error.getResponse() as { code: string }).code, code);
    return true;
  });
}

test("dispatch values normalize bounded notes and reject invalid command context", () => {
  assert.equal(normalizeDispatchNote("  left with security  "), "left with security");
  assert.equal(normalizeDispatchNote(undefined), null);
  problem(() => normalizeDispatchNote("   "));
  problem(() => normalizeDispatchNote("x".repeat(501)));
  problem(() => validateDispatchContext({ actorId: "", requestId: "req", idempotencyKey: "12345678" }));
  problem(() => validateDispatchContext({ actorId: "admin", requestId: "req", idempotencyKey: "short" }));
  assert.doesNotThrow(() => validateDispatchContext({ actorId: "admin", requestId: "req-1", idempotencyKey: "dispatch-key-1" }));
});

test("dispatch values pin failure and proof vocabularies without PIN authority", () => {
  assert.equal(normalizeFailureReason("customer_unavailable"), "customer_unavailable");
  problem(() => normalizeFailureReason("cash_not_collected"));
  assert.deepEqual(normalizeProof({ method: "signature", reference: " sig-123 ", note: " signed " }), { method: "signature", reference: "sig-123", note: "signed" });
  assert.deepEqual(normalizeProof({ method: "photo_note", reference: "photo-ref" }), { method: "photo_note", reference: "photo-ref", note: null });
  problem(() => normalizeProof({ method: "pin" as never, reference: "1234" }));
});

test("dispatch command hashes are semantic and stable", () => {
  const a = dispatchCommandHash({ action: "assign", entityId: "ord-1", body: { riderProfileId: "r-1", note: "ok" } });
  const b = dispatchCommandHash({ action: "assign", entityId: "ord-1", body: { riderProfileId: "r-1", note: "ok" } });
  const c = dispatchCommandHash({ action: "assign", entityId: "ord-1", body: { riderProfileId: "r-2", note: "ok" } });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
});
