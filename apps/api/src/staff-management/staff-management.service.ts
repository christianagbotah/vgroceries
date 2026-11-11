import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { hashPassword } from "../identity/crypto";
import type { CreateCashierRequest, ManageCashierRequest } from "./staff-management.contracts";

const managedRoles = ["admin", "inventory_manager", "cashier", "rider"] as const;
const employeeSelection = {
  id: true, name: true, email: true, phone: true, role: true,
  active: true, createdAt: true, locations: { select: { locationId: true } },
} satisfies Prisma.UserSelect;

type StaffRecord = Prisma.UserGetPayload<{ select: typeof employeeSelection }>;
function project(user: StaffRecord) {
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    role: user.role, active: user.active, createdAt: user.createdAt.toISOString(),
    locationIds: user.locations.map(x => x.locationId).sort(),
  };
}

@Injectable()
export class StaffManagementService {
  constructor(private readonly db: Database) {}

  async list() {
    const [staff, locations] = await Promise.all([
      this.db.user.findMany({
        where: { role: { in: [...managedRoles] } },
        select: employeeSelection, orderBy: [{ name: "asc" }, { id: "asc" }], take: 501,
      }),
      this.db.location.findMany({
        select: { id: true, name: true, active: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 500,
      }),
    ]);
    return {
      staff: staff.slice(0, 500).map(project),
      locations,
      capped: staff.length > 500,
    };
  }

  private async assertActiveLocations(
    tx: Prisma.TransactionClient,
    ids: string[],
  ) {
    const matches = await tx.location.count({
      where: { id: { in: ids }, active: true },
    });
    if (matches !== ids.length)
      throw new ApiProblem(400, "INVALID_LOCATION", "Select only existing, active branches.");
  }

  async create(adminId: string, requestId: string, body: CreateCashierRequest) {
    // Hash before the transaction, so the scrypt cost cannot hold DB locks.
    const passwordHash = await hashPassword(body.password);
    try {
      return await this.db.$transaction(async tx => {
        await this.assertActiveLocations(tx, body.locationIds);
        const created = await tx.user.create({
          data: {
            name: body.name, email: body.email, phone: body.phone,
            passwordHash, role: "cashier", active: true,
            locations: { create: body.locationIds.map(locationId => ({ locationId })) },
          },
          select: employeeSelection,
        });
        await tx.auditEvent.create({
          data: {
            actorId: adminId, action: "staff.cashier_created", entityId: created.id,
            requestId, details: { role: "cashier", locationIds: body.locationIds },
          },
        });
        return project(created);
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002")
        throw new ApiProblem(409, "ACCOUNT_EXISTS", "A staff account already exists with that email.");
      throw error;
    }
  }

  async manage(adminId: string, requestId: string, staffId: string, body: ManageCashierRequest) {
    if (staffId === adminId)
      throw new ApiProblem(403, "FORBIDDEN", "You cannot manage your own administrator account here.");
    // No administrators, customers, managers or riders can be modified
    // through the cashier-specific workflow.
    const current = await this.db.user.findUnique({
      where: { id: staffId }, select: { id: true, role: true, active: true },
    });
    if (!current || current.role !== "cashier")
      throw new ApiProblem(404, "NOT_FOUND", "Cashier account not found.");

    const passwordHash = body.action === "reset_password"
      ? await hashPassword(body.password) : null;

    return this.db.$transaction(async tx => {
      // Lock the row to serialize competing activation, branch and password
      // changes. Re-check the target role while locked.
      const records = await tx.$queryRaw<Array<{ role: string; active: boolean }>>`
        SELECT role::text AS role, active FROM "User"
        WHERE id=${staffId} FOR UPDATE
      `;
      if (records[0]?.role !== "cashier")
        throw new ApiProblem(404, "NOT_FOUND", "Cashier account not found.");

      if (body.action === "assign_locations") {
        await this.assertActiveLocations(tx, body.locationIds);
        await tx.userLocation.deleteMany({ where: { userId: staffId } });
        await tx.userLocation.createMany({
          data: body.locationIds.map(locationId => ({ userId: staffId, locationId })),
        });
      } else if (body.action === "set_active") {
        if (body.active) {
          const grants = await tx.userLocation.count({
            where: { userId: staffId, location: { active: true } },
          });
          if (grants === 0)
            throw new ApiProblem(409, "NO_ACTIVE_BRANCH", "Assign an active branch before reactivating a cashier.");
        }
        await tx.user.update({ where: { id: staffId }, data: { active: body.active } });
      } else {
        await tx.user.update({ where: { id: staffId }, data: { passwordHash: passwordHash! } });
      }

      // All credential/authorization changes revoke prior bearer and cookie
      // sessions. A fresh sign-in must load current branch grants.
      await tx.session.updateMany({
        where: { userId: staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: adminId, action: "staff.cashier_" + body.action,
          entityId: staffId, requestId,
          details: body.action === "assign_locations"
            ? { locationIds: body.locationIds }
            : body.action === "set_active"
              ? { active: body.active }
              : { credentialChanged: true },
        },
      });
      const updated = await tx.user.findUniqueOrThrow({
        where: { id: staffId }, select: employeeSelection,
      });
      return project(updated);
    });
  }
}
