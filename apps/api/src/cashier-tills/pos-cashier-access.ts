import { Injectable } from "@nestjs/common";
import type { SessionActor } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

/**
 * POS checkout permissions are deliberately narrower than report permissions.
 * Verify current database grants, not merely the locationIds captured by an
 * older login. Customer, rider and inventory roles never receive POS tender
 * authority. Admin till management remains separately restricted.
 */
@Injectable()
export class PosCashierAccess {
  constructor(private readonly db: Database) {}

  private role(actor: SessionActor) {
    if (actor.role !== "admin" && actor.role !== "cashier") {
      throw new ApiProblem(403, "FORBIDDEN", "POS checkout requires an authorised cashier or administrator.");
    }
  }

  async location(actor: SessionActor, locationId: string) {
    this.role(actor);
    if (actor.role === "admin") return;
    // Return NOT_FOUND for a guessed location, till, hold or receipt so that
    // the endpoint cannot disclose the existence of another branch's data.
    if (!actor.locationIds.includes(locationId)) {
      throw new ApiProblem(404, "NOT_FOUND", "Counter record not found.");
    }
    const grant = await this.db.userLocation.findUnique({
      where: { userId_locationId: { userId: actor.id, locationId } },
      include: {
        user: { select: { role: true, active: true } },
        location: { select: { active: true } },
      },
    });
    if (!grant || grant.user.role !== "cashier" || !grant.user.active || !grant.location.active) {
      throw new ApiProblem(404, "NOT_FOUND", "Counter record not found.");
    }
  }

  async till(actor: SessionActor, tillId: string) {
    this.role(actor);
    const till = await this.db.cashierTillSession.findUnique({
      where: { id: tillId },
      select: { id: true, status: true, locationId: true },
    });
    if (!till) throw new ApiProblem(404, "NOT_FOUND", "Counter till not found.");
    await this.location(actor, till.locationId);
    if (till.status !== "open") {
      throw new ApiProblem(409, "TILL_CLOSED", "The selected till is closed.");
    }
    return till;
  }

  async hold(actor: SessionActor, holdId: string) {
    this.role(actor);
    const hold = await this.db.posStockHold.findUnique({
      where: { id: holdId },
      select: { id: true, locationId: true, createdByUserId: true },
    });
    if (!hold) throw new ApiProblem(404, "NOT_FOUND", "Counter cart not found.");
    await this.location(actor, hold.locationId);
    if (actor.role === "cashier" && hold.createdByUserId !== actor.id) {
      throw new ApiProblem(404, "NOT_FOUND", "Counter cart not found.");
    }
    return hold;
  }

  async sale(actor: SessionActor, saleId: string) {
    this.role(actor);
    const sale = await this.db.posCashSale.findUnique({
      where: { id: saleId },
      select: { id: true, locationId: true, soldByUserId: true },
    });
    if (!sale) throw new ApiProblem(404, "NOT_FOUND", "Counter sale not found.");
    await this.location(actor, sale.locationId);
    if (actor.role === "cashier" && sale.soldByUserId !== actor.id) {
      throw new ApiProblem(404, "NOT_FOUND", "Counter sale not found.");
    }
    return sale;
  }
}
