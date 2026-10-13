import { Injectable } from "@nestjs/common";
import type { DeliveryJob } from "@prisma/client";
import type { DispatchProviderTransitionRequest } from "@variety/contracts";
import { ApiProblem } from "../http/errors";

function rule(message: string): never { throw new ApiProblem(422, "RULE_VIOLATION", message); }

/**
 * Manual fallback policy only. It intentionally has no HTTP client, provider SDK,
 * credentials, webhook or network dependency. Staff records externally observed milestones.
 */
@Injectable()
export class ManualProviderService {
  assertManual(job: DeliveryJob) {
    if (job.assignmentKind !== "manual_provider" || !job.providerKey)
      rule("Delivery job is not assigned to a manual provider.");
  }

  assertTransition(job: DeliveryJob, action: DispatchProviderTransitionRequest["action"]) {
    this.assertManual(job);
    const allowed: Record<DispatchProviderTransitionRequest["action"], string[]> = {
      picked_up: ["assigned"],
      out_for_delivery: ["picked_up"],
      delivered: ["out_for_delivery"],
      failed: ["assigned", "picked_up", "out_for_delivery"],
    };
    if (!allowed[action].includes(job.status)) rule(`Manual provider cannot ${action} from ${job.status}.`);
  }
}
