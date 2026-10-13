import { Injectable } from "@nestjs/common";
import type {
  ProductionFulfilmentAction,
  ProductionFulfilmentStatus,
} from "@variety/contracts";

@Injectable()
export class FulfilmentPolicyService {
  allowedActions(state: string): ProductionFulfilmentAction[] {
    switch (state as ProductionFulfilmentStatus) {
      case "awaiting_confirmation":
        return ["confirm"];
      case "confirmed":
        return ["start_picking"];
      case "picking":
        return ["record_pick", "pack"];
      case "packed":
      case "ready_for_collection":
        return ["handover"];
      default:
        return [];
    }
  }
}
