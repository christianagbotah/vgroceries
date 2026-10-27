import { Injectable } from "@nestjs/common";
import type { CustomerDetailResponse, CustomerRow } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

const money = (minor: number) => `₵${(minor / 100).toFixed(2)}`;

@Injectable()
export class AdminCustomersService {
  constructor(private readonly db: Database) {}

  async list(): Promise<CustomerRow[]> {
    const rows = await this.db.$queryRaw<{
      id: string;
      name: string;
      phone: string;
      email: string;
      createdAt: Date;
      orderCount: bigint;
      spendMinor: bigint;
      addressCount: bigint;
    }[]>`
      SELECT u.id,u.name,
        COALESCE(NULLIF(u.phone,''),
          (SELECT a.phone FROM "CustomerAddress" a WHERE a."userId"=u.id ORDER BY a."isDefault" DESC,a."createdAt" ASC,a.id ASC LIMIT 1),
          (SELECT o."customerPhone" FROM "Order" o WHERE o."customerUserId"=u.id ORDER BY o."createdAt" DESC,o.id DESC LIMIT 1),
          '') AS phone,
        u.email,u."createdAt",
        (SELECT count(*) FROM "Order" o WHERE o."customerUserId"=u.id) AS "orderCount",
        (SELECT COALESCE(sum(o."totalMinor"),0) FROM "Order" o WHERE o."customerUserId"=u.id AND o."paymentStatus" IN ('succeeded','partially_refunded','refunded')) AS "spendMinor",
        (SELECT count(*) FROM "CustomerAddress" a WHERE a."userId"=u.id) AS "addressCount"
      FROM "User" u
      WHERE u.role='customer'
      ORDER BY u.name,u.id`;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      isDemo: false,
      supportNotes: [],
      createdAt: row.createdAt.toISOString(),
      orderCount: Number(row.orderCount),
      spendLabel: money(Number(row.spendMinor)),
      returnCount: 0,
      addressCount: Number(row.addressCount),
    }));
  }

  async detail(customerId: string): Promise<CustomerDetailResponse> {
    const user = await this.db.user.findUnique({
      where: { id: customerId },
      include: {
        customerAddresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { id: "asc" }] },
        orders: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
      },
    });
    if (!user || user.role !== "customer")
      throw new ApiProblem(404, "NOT_FOUND", "Customer account not found.");

    const fallbackPhone = user.phone.trim() || user.customerAddresses[0]?.phone || user.orders[0]?.customerPhone || "";
    const addresses = user.customerAddresses.map((address) => ({
      id: address.id,
      label: address.label,
      recipientName: address.recipientName,
      phone: address.phone,
      locality: address.locality,
      street: address.street,
      ...(address.landmark ? { landmark: address.landmark } : {}),
      ...(address.ghanaPostGps ? { ghanaPostGps: address.ghanaPostGps } : {}),
      isDefault: address.isDefault,
    }));

    return {
      customer: {
        id: user.id,
        name: user.name,
        phone: fallbackPhone,
        email: user.email,
        addressIds: addresses.map((address) => address.id),
        isDemo: false,
        supportNotes: [],
        createdAt: user.createdAt.toISOString(),
      },
      addresses,
      orders: user.orders.map((order) => ({
        id: order.id,
        reference: order.reference,
        totalLabel: money(order.totalMinor),
        channel: order.channel,
        fulfilmentStatus: order.fulfilmentStatus,
        paymentStatus: order.paymentStatus,
        createdAtLabel: order.createdAt.toISOString(),
      })),
      // Physical Returns has no production persistence authority yet.
      returns: [],
    };
  }
}
