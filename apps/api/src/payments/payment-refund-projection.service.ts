import { Injectable } from "@nestjs/common";
import type { RefundSourceType, RefundStatus } from "@variety/contracts";
import type { Prisma } from "@prisma/client";

export interface PaymentRefundProjectionInput {
  order: {
    id: string;
    totalMinor: number;
    fulfilmentStatus: string;
    paymentStatus: string;
  };
  captures: { id: string; amountMinor: number }[];
  refunds: {
    amountMinor: number;
    status: RefundStatus;
    sourceType: RefundSourceType;
  }[];
}

@Injectable()
export class PaymentRefundProjectionService {
  private derive(input: PaymentRefundProjectionInput): string {
    const capturedMinor = input.captures.reduce((sum, capture) => sum + capture.amountMinor, 0);
    if (capturedMinor === 0) return input.order.paymentStatus;

    const committedRefundMinor = input.refunds.reduce((sum, refund) => sum + refund.amountMinor, 0);
    const succeededRefundMinor = input.refunds
      .filter((refund) => refund.status === "succeeded")
      .reduce((sum, refund) => sum + refund.amountMinor, 0);
    const unresolved = input.refunds.some((refund) => refund.status !== "succeeded");
    const ambiguous = input.refunds.some((refund) => refund.status === "requires_review");

    if (committedRefundMinor > capturedMinor || succeededRefundMinor > capturedMinor || ambiguous)
      return "requires_review";

    if (input.order.fulfilmentStatus === "cancelled") {
      if (committedRefundMinor < capturedMinor) return "requires_review";
      if (unresolved) return "refund_pending";
      if (succeededRefundMinor === capturedMinor) return "refunded";
      return "requires_review";
    }

    const excessMinor = Math.max(0, capturedMinor - input.order.totalMinor);
    const overchargeRefunds = input.refunds.filter(
      (refund) => refund.sourceType === "overcharge_correction",
    );
    const committedOverchargeMinor = overchargeRefunds.reduce(
      (sum, refund) => sum + refund.amountMinor,
      0,
    );
    if (excessMinor > 0 && committedOverchargeMinor < excessMinor) return "requires_review";

    if (unresolved) return "refund_pending";
    if (succeededRefundMinor === capturedMinor) return "refunded";

    const succeededOverchargeMinor = overchargeRefunds
      .filter((refund) => refund.status === "succeeded")
      .reduce((sum, refund) => sum + refund.amountMinor, 0);
    const succeededBusinessRefundMinor = input.refunds
      .filter(
        (refund) =>
          refund.status === "succeeded" && refund.sourceType !== "overcharge_correction",
      )
      .reduce((sum, refund) => sum + refund.amountMinor, 0);

    if (
      excessMinor > 0 &&
      succeededOverchargeMinor >= excessMinor &&
      succeededBusinessRefundMinor === 0 &&
      capturedMinor - succeededRefundMinor === input.order.totalMinor
    )
      return "succeeded";

    if (succeededBusinessRefundMinor > 0 || succeededRefundMinor > 0)
      return "partially_refunded";

    return input.order.paymentStatus;
  }

  async apply(
    tx: Prisma.TransactionClient,
    input: PaymentRefundProjectionInput,
  ): Promise<string> {
    const next = this.derive(input);
    if (next !== input.order.paymentStatus) {
      await tx.order.update({
        where: { id: input.order.id },
        data: { paymentStatus: next },
      });
    }
    return next;
  }
}
