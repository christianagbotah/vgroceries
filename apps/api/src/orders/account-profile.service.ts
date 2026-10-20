import { Injectable } from "@nestjs/common";
import type { AccountProfileResponse, AccountSummaryResponse } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

const money = (minor: number) => `₵${(minor / 100).toFixed(2)}`;
const terminalFulfilment = new Set(["delivered", "collected", "cancelled"]);

@Injectable()
export class AccountProfileService {
  constructor(private readonly db: Database) {}

  private async customerView(userId: string): Promise<AccountProfileResponse["customer"]> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        customerAddresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
        orders: { orderBy: { createdAt: "desc" }, take: 1, select: { customerPhone: true } },
      },
    });
    if (!user || user.role !== "customer" || !user.active)
      throw new ApiProblem(404, "NOT_FOUND", "Customer account not found.");
    return {
      id: user.id,
      name: user.name,
      phone: user.phone.trim() || user.customerAddresses[0]?.phone || user.orders[0]?.customerPhone || "",
      email: user.email,
      addressIds: user.customerAddresses.map((address) => address.id),
      isDemo: false,
      supportNotes: [],
      createdAt: user.createdAt.toISOString(),
    };
  }

  async profile(userId: string): Promise<AccountProfileResponse> {
    return { customer: await this.customerView(userId) };
  }

  async summary(userId: string): Promise<AccountSummaryResponse> {
    const [customer, addresses, orders] = await Promise.all([
      this.customerView(userId),
      this.db.customerAddress.findMany({
        where: { userId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      }),
      this.db.order.findMany({
        where: { customerUserId: userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          reference: true,
          totalMinor: true,
          fulfilmentStatus: true,
          paymentStatus: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      customer,
      addresses: addresses.map((address) => ({
        id: address.id,
        label: address.label,
        recipientName: address.recipientName,
        phone: address.phone,
        locality: address.locality,
        street: address.street,
        ...(address.landmark ? { landmark: address.landmark } : {}),
        ...(address.ghanaPostGps ? { ghanaPostGps: address.ghanaPostGps } : {}),
        isDefault: address.isDefault,
      })),
      ordersCount: orders.length,
      openOrders: orders.filter((order) => !terminalFulfilment.has(order.fulfilmentStatus)).length,
      // Physical Returns is a separate authority and is not fabricated from Refund records.
      returnsCount: 0,
      recentOrders: orders.slice(0, 5).map((order) => ({
        id: order.id,
        reference: order.reference,
        totalLabel: money(order.totalMinor),
        fulfilmentStatus: order.fulfilmentStatus,
        paymentStatus: order.paymentStatus,
        createdAtLabel: order.createdAt.toISOString(),
      })),
    };
  }

  async updateProfile(
    userId: string,
    requestId: string,
    input: { name: string; phone: string; email?: string },
  ): Promise<AccountProfileResponse> {
    const name = input.name.trim().replace(/\s+/g, " ");
    const phone = input.phone.trim().replace(/\s+/g, " ");
    const requestedEmail = (input.email ?? "").trim().toLowerCase();
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.role !== "customer" || !user.active)
        throw new ApiProblem(404, "NOT_FOUND", "Customer account not found.");
      const email = requestedEmail || user.email;
      const collision = await tx.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } });
      if (collision) throw new ApiProblem(409, "CONFLICT", "That email address is already in use.");
      await tx.user.update({ where: { id: userId }, data: { name, phone, email } });
      await tx.auditEvent.create({
        data: { actorId: userId, action: "account.profile_updated", entityId: userId, requestId, details: {} },
      });
      await tx.outboxEvent.create({
        data: { type: "account.profile_updated", aggregateId: userId, payload: { userId } },
      });
    });
    return this.profile(userId);
  }
}
