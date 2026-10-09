/** Shared client types for the account area. */

import type { apiOps } from "@/services/client";

export type AwaitedOrder = Awaited<ReturnType<typeof apiOps.accountSummary>>;
export { ApiError, apiOps } from "@/services/client";
