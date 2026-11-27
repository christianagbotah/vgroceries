import {z} from "zod";

/**
 * Cash-drawer records distinguish manual float/movements from recorded cash sales.
 * An open till or movement is never a confirmed sale, refund, payment or stock change.
 */
const id=z.string().trim().min(1).max(128);
const money=z.number().int().min(0).max(100000000);
const note=z.string().trim().min(10).max(400);
const kind=z.enum(["cash_in","cash_out","drop"]);
export const cashierTillOpenSchema=z.object({
  locationId:id,
  tillCode:z.string().trim().regex(/^[A-Z0-9_-]{1,32}$/),
  openingFloatMinor:money,
}).strict();
export type CashierTillOpen=z.infer<typeof cashierTillOpenSchema>;
export const cashierTillMoveSchema=z.object({
  kind,
  amountMinor:money.min(1),
  note,
}).strict();
export type CashierTillMove=z.infer<typeof cashierTillMoveSchema>;
export const cashierTillCloseSchema=z.object({
  countedCashMinor:money,
  note,
}).strict();
export type CashierTillClose=z.infer<typeof cashierTillCloseSchema>;
export const cashierTillMovementViewSchema=z.object({
  id,kind,amountMinor:money,note,actorUserId:id,
  createdAt:z.string().datetime({offset:true}),
}).strict();
export const cashierTillSessionViewSchema=z.object({
  id,locationId:id,tillCode:z.string(),openedByUserId:id,
  status:z.enum(["open","closed"]),openingFloatMinor:money,
  openedAt:z.string().datetime({offset:true}),
  closedAt:z.string().datetime({offset:true}).nullable(),
  closedByUserId:id.nullable(),
  closingCountedMinor:money.nullable(),
  closingExpectedMinor:money.nullable(),
  closingDifferenceMinor:z.number().int().min(-100000000).max(100000000).nullable(),
  closeNote:z.string().nullable(),
  // Opening float + manual cash in - cash out - drops, excluding sales.
  // This component can legitimately be negative when sales fund a cash drop;
  // only the combined expectedDrawerCashMinor is the physical drawer balance.
  expectedDrawerOnlyMinor:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  cashSalesMinor:money.optional(),
  expectedDrawerCashMinor:money.optional(),
  includesSales:z.boolean(),
  movements:z.array(cashierTillMovementViewSchema),
}).strict();
export type CashierTillSessionView=z.infer<typeof cashierTillSessionViewSchema>;
export const cashierTillListSchema=z.object({
  enabled:z.boolean(), includesSales:z.boolean(),
  sessions:z.array(cashierTillSessionViewSchema),
}).strict();
