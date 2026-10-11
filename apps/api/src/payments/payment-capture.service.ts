import { Injectable } from "@nestjs/common";
import type { PaymentAttempt, Prisma } from "@prisma/client";

export interface PaymentCaptureState {
  attempts: PaymentAttempt[];
  liveAttempts: PaymentAttempt[];
  successfulCaptures: PaymentAttempt[];
}

@Injectable()
export class PaymentCaptureService {
  async lockForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<PaymentCaptureState> {
    await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE "orderId"=${orderId} ORDER BY id FOR UPDATE`;
    const attempts = await tx.paymentAttempt.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
    });
    return {
      attempts,
      liveAttempts: attempts.filter(
        (attempt) => attempt.status === "initiated" || attempt.status === "pending",
      ),
      successfulCaptures: attempts.filter((attempt) => attempt.status === "succeeded"),
    };
  }
}
