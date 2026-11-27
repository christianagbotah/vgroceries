import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
test("real POS overview exposes enabled read-only reports without reviving demo sales",()=>{
 const page=readFileSync("src/app/admin/pos/page.tsx","utf8");
 const real=page.slice(page.indexOf("export default function AdminPosPage"));
 expect(real).toContain('process.env.NEXT_PUBLIC_API_BASE_URL?.trim()');
 expect(real).toContain('verifiedPosCashHistoryUatEnabled ? <Button');
 expect(real).toContain('href="/admin/pos/verified-uat/history"');
 expect(real).toContain('verifiedPosTillReconciliationUatEnabled ? <Button');
 expect(real).toContain('href="/admin/pos/verified-uat/reconciliation"');
 expect(real).toContain('Production POS is not yet activated for new sales');
 expect(real).not.toContain("apiOps.posComplete");
 expect(real).toContain("return <DemoPosPage />");
 const quote=readFileSync("src/features/staff/verified-pos-quote-uat.tsx","utf8");
 const disabled=quote.slice(quote.indexOf("if (!verifiedPosQuoteUatEnabled) {"));
 const first=disabled.slice(0,disabled.indexOf("\n  return ("));
 expect(first).toContain('verifiedPosCashHistoryUatEnabled ? <Button');
 expect(first).toContain('verifiedPosTillReconciliationUatEnabled ? <Button');
});
