import type { CashierTillSessionView } from "@/services/contracts";

/** Filters only the server-returned till records; never implies a full ledger search. */
export type CashTillStatus = "all" | "open" | "closed";

export function filterCashTillSessions(
  sessions: readonly CashierTillSessionView[],
  search: string,
  status: CashTillStatus,
): CashierTillSessionView[] {
  const needle = search.trim().toLocaleLowerCase("en-GH");
  return sessions.filter(till =>
    (status === "all" || till.status === status) &&
    (!needle || `${till.tillCode} ${till.locationId}`
      .toLocaleLowerCase("en-GH").includes(needle)),
  );
}
