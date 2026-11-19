/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { settlementEvidence } from "../src/features/staff/payment-evidence";
import { normalizePaymentLedgerPage } from "../src/services/payment-ledger";
import { statusTone } from "../src/components/shared/status-badge";

const base = {
  attemptId:"attempt-1",orderId:"order-1",orderReference:"VG-2026-001",
  provider:"hubtel",method:"hosted_checkout",amountMinor:5500,
  status:"initiated",initiationState:"uncertain",settlementState:"exception",
  callbackCount:0,createdAt:"2026-11-19T09:30:00.000Z",
};
describe("staff payment verification exceptions are not failed charges",()=>{
  test("unknown provider outcome is labelled investigation, never failure or paid",()=>{
    const details=settlementEvidence("exception");
    expect(details.badgeStatus).toBe("requires_review");
    expect(details.label).toBe("Verification exception");
    expect(details.explanation).toContain("Do not infer success, failure or refund");
    expect(statusTone("payment",details.badgeStatus)).toBe("info");
    expect(statusTone("payment","failed")).toBe("danger");
    expect(details.badgeStatus).not.toBe("failed");
  });
  test("reconciled record is distinct from a confirmed bank deposit",()=>{
    const detail=settlementEvidence("reconciled");
    expect(detail.badgeStatus).not.toBe("succeeded");
    expect(detail.explanation).toContain("merchant bank payout is a separate check");
    expect(settlementEvidence("settled").explanation).toContain("not independently proven as a bank deposit");
    expect(settlementEvidence("unsettled").label).toBe("Unsettled");
    expect(settlementEvidence("unrecognized-state").badgeStatus).toBe("requires_review");
  });
  test("actual server initiationState is preserved without claiming payment",()=>{
    const normalized=normalizePaymentLedgerPage({
      page:1,perPage:25,total:1,items:[base],
    },{page:1,perPage:25});
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]).toMatchObject({
      status:"initiated",initiationState:"uncertain",settlementState:"exception",
      amountLabel:"₵55.00",
    });
    expect(normalized.total).toBe(1);
    expect(normalized.items[0].status).not.toBe("failed");
  });
  test("admin UI presents exception safely in mobile and desktop without mutation buttons",()=>{
    const code=readFileSync("src/app/admin/payments/page.tsx","utf8");
    expect(code).toContain("settlementEvidence(p.settlementState)");
    expect(code).toContain('p.initiationState === "uncertain"');
    expect(code).toContain('setSettlement("exception")');
    expect(code).toContain("Review exceptions");
    expect(code).toContain("An exception or uncertain initiation is not a payment failure");
    expect(code).toContain("never re-charge a customer");
    expect(code).not.toContain('settlementState === "exception" ? "failed"');
    expect(code).not.toContain('apiOps.paymentOutcome');
    expect(code).not.toContain('apiOps.paymentReconcile');
  });
});
