import { z } from "zod";

/**
 * Cashier's own, read-only POS facts. Never a till reconciliation, a payment
 * receipt or an authority to reserve inventory or hand over goods.
 * No customer identity or drawer movements are disclosed.
 */
const id = z.string().min(1).max(128);
const timestamp = z.string().datetime({ offset: true });
export const cashierWorkspaceSchema = z.object({
  enabled: z.boolean(),
  cashSalesEnabled: z.boolean(),
  locations: z.array(z.object({
    id,
    name: z.string().min(1),
  }).strict()).max(100),
  openTills: z.array(z.object({
    id, locationId: id,
    tillCode: z.string().min(1),
    openedAt: timestamp,
  }).strict()).max(30),
  ownRecentCashSales: z.array(z.object({
    id, reference: z.string().min(1),
    locationId: id, tillSessionId: id,
    subtotalMinor: z.number().int().min(0).max(100000000),
    createdAt: timestamp,
  }).strict()).max(25),
}).strict();
export type CashierWorkspace = z.infer<typeof cashierWorkspaceSchema>;
