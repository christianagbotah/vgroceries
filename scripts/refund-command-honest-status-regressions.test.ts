/// <reference types="bun-types" />
import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import type {LegacyRefundActionResponse} from "../packages/contracts/src/returns";

const source=readFileSync("src/app/admin/refunds/page.tsx","utf8");

describe("Refund command acknowledgement is not provider money movement",()=>{
  test("legacy action's only affirmative field is a command flag, not transfer evidence",()=>{
    const response:LegacyRefundActionResponse={done:true};
    expect(response.done).toBe(true);
    expect(source).toContain("const result = await apiOps.refundAction(id, action, user.id)");
    expect(source).toContain("if (result.done !== true)");
    expect(source).toContain("Refund action not confirmed");
    expect(source).toContain("Check the refund and provider transfer history before attempting it again.");
  });
  test("approval, execution and retry labels never claim a completed transfer",()=>{
    expect(source).toContain('action === "approve" ? "Refund approval recorded" : "Refund command received"');
    expect(source).toContain("Approval is not proof of a payout");
    expect(source).toContain("Submission is not confirmation of a provider transfer.");
    expect(source).not.toContain("Refund executed via provider");
    expect(source).not.toContain("Refund approved — ready to execute");
    expect(source).not.toContain("Demo behaviour:");
  });
  test("unknown server or network outcome cautions against retry and reloads the ledger",()=>{
    expect(source).toContain("Refund outcome requires verification");
    expect(source).toContain("Do not retry until the provider transfer state has been checked.");
    expect(source).toContain("} finally {");
    expect(source).toContain("await reload();");
    expect(source).toContain("setBusy(null);");
    expect(source).toContain('title: "Refund ledger refresh failed"');
    expect(source).toContain("The command outcome remains unverified.");
    expect(source).toMatch(/try \\{\\s*await reload\\(\\);\\s*\\} catch \\{[\\s\\S]*?\\} finally \\{[\\s\\S]*?setBusy\\(null\\);/);
  });
  test("each action still requires staff permission and an idle workflow",()=>{
    expect(source).toContain('if (busy !== null || !can("refunds.approve")) return');
    expect(source).toContain('r.status === "awaiting_approval" && can("refunds.approve")');
    expect(source).toContain('r.status === "processing" && can("refunds.approve")');
    expect(source).toContain('r.status === "failed" && can("refunds.approve")');
    expect(source).not.toContain("setRefundStatus");
    expect(source).not.toContain("setPaymentStatus");
  });
  test("manual recordings remain distinct from provider transfers",()=>{
    expect(source).toContain('r.method === "manual_recording"');
    expect(source).toContain("not a provider transfer");
    expect(source).toContain("Manual recording is not a provider transfer");
    expect(source).toContain("independently reconciled provider transfer state");
  });
});
