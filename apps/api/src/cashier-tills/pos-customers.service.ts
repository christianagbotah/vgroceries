import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import type { AuthRequest } from "../identity/identity.service";
import {
  posCustomerSearchQuerySchema,
  posCustomerSearchResultSchema,
} from "@variety/contracts";

/**
 * A bounded, read-only customer selector for a till. Unlike the POS WIP
 * global account search, a cashier sees only past registered POS customers
 * in their currently granted active branches. All returned phone numbers
 * are masked and no email or financial data is returned.
 */
@Injectable()
export class PosCustomersService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async search(req: AuthRequest, query: unknown) {
    // Independent default-off feature flag: deploying this source alone is
    // not authorization to expose customer-identifying search results.
    if (!this.config.posCustomerLookupEnabled || !this.config.posTillFoundationEnabled)
      throw new ApiProblem(404, "NOT_FOUND", "POS customer lookup is not available.");

    const role = req.actor.role;
    if (role !== "cashier" && role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "POS customer lookup is not permitted.");

    if (typeof query !== "string")
      throw new ApiProblem(400, "VALIDATION_FAILED", "Search must be a text value.");
    const normalized = query.trim();
    const parsed = normalized.length < 2
      ? null
      : posCustomerSearchQuerySchema.safeParse(normalized);
    if (parsed && !parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Search must contain 2 to 80 characters.");

    let activeBranchIds: string[] = [];
    if (role === "cashier") {
      // Never trust the location IDs embedded in a login-time actor snapshot.
      // Check the current assignments and active branch status on every query.
      const grants = await this.db.userLocation.findMany({
        where: {
          userId: req.actor.id,
          user: { is: { role: "cashier", active: true } },
          location: { is: { active: true } },
        },
        orderBy: { locationId: "asc" },
        select: { locationId: true },
        take: 100,
      });
      activeBranchIds = grants.map((grant) => grant.locationId);
      if (!activeBranchIds.length)
        throw new ApiProblem(403, "FORBIDDEN", "No active cashier branch assignment.");
    }

    // Even an empty search must not bypass the live branch access check.
    if (!parsed) return [];

    // Database-backed, actor-scoped throttle prevents repeated name-prefix
    // enumeration. No raw query, phone, email or customer details are logged.
    const key = createHash("sha256").update("pos-customer-lookup:" + req.actor.id).digest("hex");
    const rows = await this.db.$queryRaw<{ attempts: number }[]>`
      INSERT INTO "LoginThrottle" (key, "windowStart", attempts)
      VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE
          WHEN "LoginThrottle"."windowStart" <= now() - interval '15 minutes'
          THEN 1 ELSE "LoginThrottle".attempts + 1 END,
        "windowStart" = CASE
          WHEN "LoginThrottle"."windowStart" <= now() - interval '15 minutes'
          THEN now() ELSE "LoginThrottle"."windowStart" END
      RETURNING attempts`;
    if (!rows.length || rows[0].attempts > 120)
      throw new ApiProblem(429, "RATE_LIMITED", "Too many searches. Try again later.");

    const customers = await this.db.user.findMany({
      where: {
        role: "customer",
        active: true,
        ...(role === "cashier" ? {
          posCustomerSales: { some: { locationId: { in: activeBranchIds } } },
        } : {}),
        OR: [
          { name: { contains: parsed.data, mode: "insensitive" } },
          { phone: { contains: parsed.data } },
          { email: { contains: parsed.data, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, phone: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 15,
    });
    return posCustomerSearchResultSchema.parse(customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phoneLast4: customer.phone.replace(/\D/g, "").slice(-4),
    })));
  }
}
