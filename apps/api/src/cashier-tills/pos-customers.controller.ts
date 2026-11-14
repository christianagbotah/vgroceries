import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Database } from "../database/database";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { ApiProblem } from "../http/errors";

const querySchema = z.string().trim().min(2).max(80);

/**
 * Registered customer lookup strictly for authorised cashier/admin users.
 * Never exposes password/session data or the full customer roster.
 * Requires 2+ characters and returns at most 15 matching customers.
 */
@ApiTags("pos-customers")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("admin/pos/customers")
export class PosCustomersController {
  constructor(private readonly db: Database) {}

  @Get()
  async search(@Req() req: AuthRequest, @Query("q") query: unknown) {
    if (req.actor.role !== "cashier" && req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN",
        "Customer lookup is available only to authorised POS cashiers.");

    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      if (typeof query === "string" && query.trim().length < 2)
        return { ok: true, data: [] };
      throw new ApiProblem(400, "VALIDATION_FAILED", "Search customers using 2 to 80 characters.");
    }
    const q = parsed.data;
    const customers = await this.db.user.findMany({
      where: {
        role: "customer", active: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 15,
    });
    return { ok: true, data: customers };
  }
}
