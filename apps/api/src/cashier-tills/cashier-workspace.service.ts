import { Inject, Injectable } from "@nestjs/common";
import { cashierWorkspaceSchema } from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import type { AuthRequest } from "../identity/identity.service";

/**
 * A restricted operational read. This does not reuse the administrator POS
 * projections: those expose floats, movements, staff IDs and inventory
 * handover details that cashiers do not need to see.
 */
@Injectable()
export class CashierWorkspaceService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async read(req: AuthRequest) {
    if (req.actor.role !== "cashier") {
      throw new ApiProblem(403, "FORBIDDEN", "A cashier account is required.");
    }

    // Verify grants at read time, not from route parameters or an earlier
    // login snapshot. Revoked or disabled branches cannot enter the query.
    const assignments = await this.db.userLocation.findMany({
      where: {
        userId: req.actor.id,
        user: { is: { role: "cashier", active: true } },
        location: { is: { active: true } },
      },
      orderBy: { locationId: "asc" },
      take: 100,
      select: {
        locationId: true,
        location: { select: { id: true, name: true } },
      },
    });
    if (assignments.length === 0) {
      throw new ApiProblem(403, "FORBIDDEN", "No active cashier branch assignment.");
    }
    const allowedLocationIds = assignments.map(({ locationId }) => locationId);
    const enabled = this.config.posTillFoundationEnabled;
    const cashSalesEnabled = enabled && this.config.posCashSalesEnabled;

    // Disabled POS has no operational reads; location assignments are still
    // included so staff can see which branch is configured.
    if (!enabled) {
      return cashierWorkspaceSchema.parse({
        enabled: false,
        cashSalesEnabled: false,
        locations: assignments.map(({ location }) => location),
        openTills: [],
        ownRecentCashSales: [],
      });
    }

    const openTills = await this.db.cashierTillSession.findMany({
      where: { locationId: { in: allowedLocationIds }, status: "open" },
      select: { id: true, locationId: true, tillCode: true, openedAt: true },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      take: 30,
    });
    const ownRecentCashSales = cashSalesEnabled
      ? await this.db.posCashSale.findMany({
          where: {
            locationId: { in: allowedLocationIds },
            soldByUserId: req.actor.id,
          },
          select: {
            id: true, reference: true, locationId: true,
            tillSessionId: true, subtotalMinor: true, createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 25,
        })
      : [];
    return cashierWorkspaceSchema.parse({
      enabled,
      cashSalesEnabled,
      locations: assignments.map(({ location }) => location),
      openTills: openTills.map((till) => ({
        ...till, openedAt: till.openedAt.toISOString(),
      })),
      ownRecentCashSales: ownRecentCashSales.map((sale) => ({
        ...sale, createdAt: sale.createdAt.toISOString(),
      })),
    });
  }
}
