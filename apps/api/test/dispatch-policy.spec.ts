import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiProblem } from "../src/http/errors";
import { DispatchPolicyService } from "../src/dispatch/dispatch-policy.service";

const policy = new DispatchPolicyService();
const eligibleOrder = {
  fulfilment: "delivery",
  fulfilmentStatus: "dispatched",
  deliveryStatus: "unassigned",
  stockConsumedAt: new Date("2026-10-13T10:00:00Z"),
  cancelledAt: null,
};
const handover = { handedOverAt: new Date("2026-10-13T10:00:00Z"), handoverKind: "dispatch" };

function rejected(fn: () => unknown) {
  assert.throws(fn, (error: unknown) => error instanceof ApiProblem && [409, 422].includes(error.getStatus()));
}

test("dispatch policy accepts only authoritative delivery handover", () => {
  assert.doesNotThrow(() => policy.assertDispatchEligible(eligibleOrder, handover));
  rejected(() => policy.assertDispatchEligible({ ...eligibleOrder, fulfilment: "collection" }, handover));
  rejected(() => policy.assertDispatchEligible({ ...eligibleOrder, fulfilmentStatus: "packed" }, handover));
  rejected(() => policy.assertDispatchEligible({ ...eligibleOrder, stockConsumedAt: null }, handover));
  rejected(() => policy.assertDispatchEligible(eligibleOrder, { ...handover, handoverKind: "collection" }));
  rejected(() => policy.assertDispatchEligible({ ...eligibleOrder, cancelledAt: new Date() }, handover));
});

test("dispatch policy derives busy instead of persisting it", () => {
  assert.equal(policy.effectiveRiderState({ availabilityState: "offline", userActive: true, hasActiveJob: false }), "offline");
  assert.equal(policy.effectiveRiderState({ availabilityState: "available", userActive: false, hasActiveJob: false }), "offline");
  assert.equal(policy.effectiveRiderState({ availabilityState: "available", userActive: true, hasActiveJob: true }), "busy");
  assert.equal(policy.effectiveRiderState({ availabilityState: "available", userActive: true, hasActiveJob: false }), "available");
});

test("dispatch policy exposes only truthfully supported proof methods", () => {
  assert.deepEqual(policy.allowedProofMethods(), ["signature", "photo_note"]);
  assert.equal(policy.allowedProofMethods().includes("pin" as never), false);
});

test("dispatch policy blocks reassignment after physical custody leaves dispatch", () => {
  for (const custody of ["rider", "provider", "customer", "return_pending"] as const) {
    assert.equal(policy.canReassign({ status: "failed", custodyState: custody, returnedToStoreAt: null }), false);
  }
  assert.equal(policy.canReassign({ status: "assigned", custodyState: "dispatch", returnedToStoreAt: null }), true);
  assert.equal(policy.canReassign({ status: "return_to_store", custodyState: "store_returned", returnedToStoreAt: new Date() }), true);
});

test("failed custody permits recovery actions without pretending reassignment is safe", () => {
  const failed = policy.adminJobDecision({ status: "failed", custodyState: "rider", returnedToStoreAt: null });
  assert.equal(failed.allowedActions.includes("reschedule"), true);
  assert.equal(failed.allowedActions.includes("return_to_store"), true);
  assert.equal(failed.allowedActions.includes("reassign"), false);
  const returning = policy.adminJobDecision({ status: "return_to_store", custodyState: "return_pending", returnedToStoreAt: null });
  assert.deepEqual(returning.allowedActions, ["receive_returned_goods"]);
});


test("effective busy state outranks declared offline while a rider owns active work",()=>{
  assert.equal(policy.effectiveRiderState({availabilityState:"offline",userActive:true,hasActiveJob:true}),"busy");
});

test("admin actions expose manual provider transitions and rescheduled recovery truth",()=>{
  const assignedProvider=policy.adminJobDecision({status:"assigned",custodyState:"dispatch",returnedToStoreAt:null,assignmentKind:"manual_provider",rescheduledFor:null} as any);
  assert.equal(assignedProvider.allowedActions.includes("provider_transition"),true);
  const future=new Date(Date.now()+60_000);
  const pendingRetry=policy.adminJobDecision({status:"rescheduled",custodyState:"provider",returnedToStoreAt:null,assignmentKind:"manual_provider",rescheduledFor:future} as any);
  assert.equal(pendingRetry.allowedActions.includes("return_to_store"),true);
  assert.equal(pendingRetry.allowedActions.includes("provider_transition"),false);
  assert.equal(pendingRetry.blockers.includes("reschedule_not_due"),true);
  const dueRetry=policy.adminJobDecision({status:"rescheduled",custodyState:"provider",returnedToStoreAt:null,assignmentKind:"manual_provider",rescheduledFor:new Date(Date.now()-1000)} as any);
  assert.equal(dueRetry.allowedActions.includes("provider_transition"),true);
  assert.equal(dueRetry.allowedActions.includes("return_to_store"),true);
});

test("rider actions expose custody-preserving rescheduled retry only when due",()=>{
  const future=new Date(Date.now()+60_000);
  const pending=policy.riderJobDecision("rescheduled","rider",future);
  assert.deepEqual(pending.allowedActions,["note"]);
  assert.equal(pending.blockers.includes("reschedule_not_due"),true);
  const dueRider=policy.riderJobDecision("rescheduled","rider",new Date(Date.now()-1000));
  assert.equal(dueRider.allowedActions.includes("out_for_delivery"),true);
  const dueDispatch=policy.riderJobDecision("rescheduled","dispatch",new Date(Date.now()-1000));
  assert.equal(dueDispatch.allowedActions.includes("accept"),true);
});


test("physically returned unassigned jobs advertise assignment without losing return custody truth",()=>{
  const decision=policy.adminJobDecision({status:"unassigned",custodyState:"store_returned",returnedToStoreAt:new Date("2026-10-13T11:00:00Z")});
  assert.deepEqual(decision.allowedActions,["assign"]);
  assert.deepEqual(decision.blockers,[]);
});
