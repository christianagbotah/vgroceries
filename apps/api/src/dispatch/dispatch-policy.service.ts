import { Injectable } from "@nestjs/common";
import type { DispatchProofMethod, RiderDeclaredAvailability, RiderEffectiveAvailability } from "@variety/contracts";
import { ApiProblem } from "../http/errors";

interface DispatchEligibleOrder {
  fulfilment: string;
  fulfilmentStatus: string;
  deliveryStatus: string;
  stockConsumedAt: Date | null;
  cancelledAt: Date | null;
}
interface HandoverEvidence { handedOverAt: Date | null; handoverKind: string | null; }
interface RiderStateInput { availabilityState: string; userActive: boolean; hasActiveJob: boolean; }
interface ReassignableJob { status: string; custodyState: string; returnedToStoreAt: Date | null; }

function rule(message: string): never {
  throw new ApiProblem(422, "RULE_VIOLATION", message);
}

@Injectable()
export class DispatchPolicyService {
  assertDispatchEligible(order: DispatchEligibleOrder, run: HandoverEvidence | null) {
    if (order.cancelledAt || order.fulfilmentStatus === "cancelled") rule("Cancelled orders cannot enter dispatch.");
    if (order.fulfilment !== "delivery") rule("Only delivery orders enter dispatch.");
    if (order.fulfilmentStatus !== "dispatched") rule("Order has not reached authoritative dispatch handover.");
    if (!order.stockConsumedAt) rule("Order stock has not been consumed at fulfilment handover.");
    if (!run?.handedOverAt || run.handoverKind !== "dispatch") rule("Authoritative dispatch handover evidence is missing.");
  }

  effectiveRiderState(input: RiderStateInput): RiderEffectiveAvailability {
    if (!input.userActive || input.availabilityState !== "available") return "offline";
    return input.hasActiveJob ? "busy" : "available";
  }

  allowedProofMethods(): DispatchProofMethod[] {
    return ["signature", "photo_note"];
  }

  canReassign(job: ReassignableJob): boolean {
    if (job.custodyState === "dispatch") return true;
    return job.status === "return_to_store" && job.custodyState === "store_returned" && Boolean(job.returnedToStoreAt);
  }

  adminJobDecision(job: ReassignableJob): { allowedActions: ("assign" | "unassign" | "reassign" | "reschedule" | "return_to_store" | "receive_returned_goods" | "provider_transition")[]; blockers: string[] } {
    if (job.status === "unassigned" && job.custodyState === "dispatch") return { allowedActions: ["assign"], blockers: [] };
    if (job.status === "return_to_store" && job.custodyState === "return_pending")
      return { allowedActions: ["receive_returned_goods"], blockers: ["return_not_physically_received"] };
    if (job.status === "failed") {
      const safe = this.canReassign(job);
      const actions: ("unassign" | "reassign" | "reschedule" | "return_to_store")[] = [];
      if (safe) actions.push("unassign", "reassign");
      actions.push("reschedule");
      if (["rider", "provider"].includes(job.custodyState)) actions.push("return_to_store");
      return { allowedActions: actions, blockers: safe ? [] : ["custody_not_safe_for_reassignment"] };
    }
    if (this.canReassign(job)) return { allowedActions: ["unassign", "reassign"], blockers: [] };
    return { allowedActions: [], blockers: ["custody_not_safe_for_reassignment"] };
  }

  riderJobDecision(status: string, custodyState: string): { allowedActions: ("set_availability" | "accept" | "pickup" | "out_for_delivery" | "deliver" | "fail" | "note")[]; blockers: string[] } {
    if (status === "assigned") return { allowedActions: ["accept", "note"], blockers: [] };
    if (status === "accepted") return { allowedActions: ["pickup", "fail", "note"], blockers: [] };
    if (status === "picked_up") return { allowedActions: ["out_for_delivery", "fail", "note"], blockers: [] };
    if (status === "out_for_delivery") return { allowedActions: ["deliver", "fail", "note"], blockers: [] };
    if (["failed", "rescheduled"].includes(status)) return { allowedActions: ["note"], blockers: [] };
    if (status === "return_to_store" && custodyState === "return_pending") return { allowedActions: ["note"], blockers: [] };
    return { allowedActions: [], blockers: ["invalid_state"] };
  }

  assertRiderAssignable(input: { availabilityState: RiderDeclaredAvailability; userActive: boolean; hasActiveJob: boolean }) {
    const state = this.effectiveRiderState(input);
    if (state === "offline") rule("Rider is offline.");
    if (state === "busy") rule("Rider already owns an active delivery.");
  }
}
