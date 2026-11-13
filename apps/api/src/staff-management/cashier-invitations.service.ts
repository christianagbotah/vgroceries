import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { hashPassword, randomToken, tokenHash } from "../identity/crypto";
import type {
  InviteCashierRequest, AcceptCashierInvitationRequest,
} from "./staff-management.contracts";

const lifetimeMs = 48 * 60 * 60 * 1000;
const invalidInvitation = () => new ApiProblem(
  400, "INVALID_INVITATION", "The invitation is invalid, expired or already used.",
);

@Injectable()
export class CashierInvitationsService {
  constructor(private readonly db: Database) {}

  async issue(adminId: string, requestId: string, data: InviteCashierRequest) {
    const email = data.email.trim().toLowerCase();
    const code = randomToken();
    const digest = tokenHash(code);
    const expiresAt = new Date(Date.now() + lifetimeMs);
    // No usable administrator-selected password is ever assigned.
    const passwordHash = await hashPassword(randomToken());
    try {
      const staff = await this.db.$transaction(async tx => {
        const locations = await tx.location.count({
          where: { id: { in: data.locationIds }, active: true },
        });
        if (locations !== data.locationIds.length)
          throw new ApiProblem(400, "INVALID_LOCATION", "Select only active branches.");

        const existing = await tx.user.findUnique({
          where: { email }, include: { staffInvitation: true },
        });
        let userId: string;
        if (existing) {
          // Reissue is possible only for a still-pending cashier; accepting,
          // suspended, or other-role accounts cannot be overwritten.
          if (existing.role !== "cashier" || existing.active ||
              !existing.staffInvitation || existing.staffInvitation.acceptedAt)
            throw new ApiProblem(409, "ACCOUNT_EXISTS", "Account cannot be invited again.");

          userId = existing.id;
          await tx.user.update({
            where: { id: userId },
            data: { name: data.name, phone: data.phone },
          });
          await tx.userLocation.deleteMany({ where: { userId } });
          await tx.userLocation.createMany({
            data: data.locationIds.map(locationId => ({ userId, locationId })),
          });
          await tx.staffInvitation.update({
            where: { userId },
            data: { tokenHash: digest, expiresAt, acceptedAt: null,
              revokedAt: null, createdAt: new Date(), createdByUserId: adminId },
          });
          await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        } else {
          const created = await tx.user.create({
            data: {
              name: data.name, email, phone: data.phone, passwordHash,
              role: "cashier", active: false,
              locations: {
                create: data.locationIds.map(locationId => ({ locationId })),
              },
              staffInvitation: {
                create: { tokenHash: digest, expiresAt, createdByUserId: adminId },
              },
            },
            select: { id: true },
          });
          userId = created.id;
        }
        await tx.auditEvent.create({
          data: {
            actorId: adminId,
            action: existing ? "staff.cashier_invitation_reissued" : "staff.cashier_invitation_issued",
            entityId: userId,
            requestId,
            details: { locationIds: data.locationIds, expiresAt: expiresAt.toISOString() },
          },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { id: true, name: true, email: true, phone: true,
            role: true, active: true, createdAt: true,
            locations: { select: { locationId: true } } },
        });
      });
      return {
        cashier: {
          id: staff.id, name: staff.name, email: staff.email, phone: staff.phone,
          role: staff.role, active: staff.active,
          createdAt: staff.createdAt.toISOString(),
          locationIds: staff.locations.map(x => x.locationId).sort(),
          invitationStatus: "pending" as const,
          invitationExpiresAt: expiresAt.toISOString(),
        },
        // Never persist the plaintext code, including in an audit record.
        code,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002")
        throw new ApiProblem(409, "ACCOUNT_EXISTS", "A staff account already exists with that email.");
      throw error;
    }
  }

  private async throttle(ip: string) {
    const key = tokenHash("staff-accept:" + ip);
    const rows = await this.db.$queryRaw<Array<{ attempts: number }>>`
      INSERT INTO "LoginThrottle" (key, "windowStart", attempts)
      VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN "LoginThrottle"."windowStart" <= now()-interval '15 minutes'
        THEN 1 ELSE "LoginThrottle".attempts + 1 END,
      "windowStart" = CASE WHEN "LoginThrottle"."windowStart" <= now()-interval '15 minutes'
        THEN now() ELSE "LoginThrottle"."windowStart" END
      RETURNING attempts
    `;
    if (rows[0]?.attempts > 20)
      throw new ApiProblem(429, "RATE_LIMITED", "Too many activation attempts.");
  }

  async accept(requestId: string, ip: string, body: AcceptCashierInvitationRequest) {
    await this.throttle(ip);
    const digest = tokenHash(body.code);
    const invitation = await this.db.staffInvitation.findUnique({
      where: { tokenHash: digest },
      select: { id: true, userId: true },
    });
    if (!invitation) throw invalidInvitation();

    // Hash before entering the transaction to avoid holding database locks
    // during the intentionally expensive scrypt computation.
    const passwordHash = await hashPassword(body.password);
    return this.db.$transaction(async tx => {
      const now = new Date();
      const used = await tx.staffInvitation.updateMany({
        where: {
          id: invitation.id, tokenHash: digest,
          acceptedAt: null, revokedAt: null, expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });
      if (used.count !== 1) throw invalidInvitation();
      const user = await tx.user.updateMany({
        where: { id: invitation.userId, role: "cashier", active: false },
        data: { passwordHash, active: true },
      });
      if (user.count !== 1) throw invalidInvitation();
      const branches = await tx.userLocation.count({
        where: { userId: invitation.userId, location: { active: true } },
      });
      if (branches === 0)
        throw new ApiProblem(409, "NO_ACTIVE_BRANCH", "Contact your administrator to assign an active branch.");
      await tx.session.updateMany({
        where: { userId: invitation.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditEvent.create({
        data: {
          actorId: invitation.userId,
          action: "staff.cashier_invitation_accepted",
          entityId: invitation.userId, requestId,
          details: { via: "one_time_code" },
        },
      });
      return { activated: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
