import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
test("private reports clear access and serialize report requests",()=>{
 const till=readFileSync("src/features/staff/verified-pos-till-reconciliation-uat.tsx","utf8");
 expect(till).toContain('activeReview.current = true');
 expect(till).toContain('setAdminName(""); setTills([]); setTillId(""); setReport(null);');
 expect(till).toContain('adminName && !error && report && report.tillSessionId === tillId');
 expect(till).toContain('activeReview.current = false; setBusy(false)');
 const history=readFileSync("src/features/staff/verified-pos-cash-history-uat.tsx","utf8");
 expect(history).toContain('pageRequest.current = true');
 expect(history).toContain('pageRequest.current = false');
 expect(history).toContain('setAdmin("");\n        setSales([]);\n        setNextCursor(null);\n        setCurrentCursor(null);');
});
