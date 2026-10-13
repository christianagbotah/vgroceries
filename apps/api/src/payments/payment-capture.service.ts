import { Injectable } from "@nestjs/common";
import type { PaymentAttempt, Prisma } from "@prisma/client";

export interface PaymentCaptureState {
  attempts: PaymentAttempt[];
  liveAttempts: PaymentAttempt[];
  successfulCaptures: PaymentAttempt[];
}

export interface PaymentHandoverCoverage {
  successfulCapturedMinor: number;
  successfulRefundedMinor: number;
  retainedMinor: number;
  liveOrUncertain: boolean;
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

  async getHandoverCoverage(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<PaymentHandoverCoverage> {
    const state = await this.lockForOrder(tx, orderId);

    await tx.$queryRaw`SELECT id FROM "Refund" WHERE "orderId"=${orderId} ORDER BY id FOR UPDATE`;
    const refunds = await tx.refund.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
      select: { amountMinor: true, status: true },
    });

    const successfulCapturedMinor = state.successfulCaptures.reduce(
      (sum, attempt) => sum + attempt.amountMinor,
      0,
    );
    const successfulRefundedMinor = refunds
      .filter((refund) => refund.status === "succeeded")
      .reduce((sum, refund) => sum + refund.amountMinor, 0);

    const liveOrUncertain =
      state.liveAttempts.length > 0 ||
      state.attempts.some(
        (attempt) =>
          attempt.initiationState === "uncertain" ||
          attempt.settlementState === "exception",
      ) ||
      refunds.some((refund) => refund.status !== "succeeded");

    return {
      successfulCapturedMinor,
      successfulRefundedMinor,
      retainedMinor: successfulCapturedMinor - successfulRefundedMinor,
      liveOrUncertain,
    };
  }
}
