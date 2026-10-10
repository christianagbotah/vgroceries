import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiProblem } from "../http/errors";
import { IdentityService } from "../identity/identity.service";
import { GuestCheckoutService } from "./guest-checkout.service";

export type CheckoutPrincipal =
  | { kind: "customer"; userId: string; actorId: string; actorScope: string }
  | { kind: "guest"; guestSessionId: string; actorId: string; actorScope: string };

function hasCustomerCredentials(req: Request) {
  if (req.get("authorization")) return true;
  return !!req
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .some((part) => part.startsWith("vg_session="));
}

@Injectable()
export class CheckoutPrincipalService {
  constructor(
    private readonly identity: IdentityService,
    private readonly guests: GuestCheckoutService,
  ) {}

  private async customer(req: Request): Promise<CheckoutPrincipal> {
    const auth = await this.identity.authenticate(req as Parameters<IdentityService["authenticate"]>[0]);
    if (auth.actor.role !== "customer")
      throw new ApiProblem(403, "FORBIDDEN", "Customer checkout access required.");
    return {
      kind: "customer",
      userId: auth.actor.id,
      actorId: auth.actor.id,
      actorScope: `customer:${auth.actor.id}`,
    };
  }

  async forMutation(req: Request, res: Response): Promise<CheckoutPrincipal> {
    if (hasCustomerCredentials(req)) return this.customer(req);
    const guest = await this.guests.requireMutation(req, res);
    return { kind: "guest", ...guest };
  }

  async forRead(req: Request): Promise<CheckoutPrincipal> {
    if (hasCustomerCredentials(req)) return this.customer(req);
    const guest = await this.guests.requireRead(req);
    return { kind: "guest", ...guest };
  }
}
