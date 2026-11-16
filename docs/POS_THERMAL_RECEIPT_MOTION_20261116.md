# Variety Groceries — physical POS receipt roll presentation

Date: 16 November 2026. Release status: source-only, not deployed.

This increment improves the **already authenticated, read-only POS 80 mm
receipt print endpoint** with a browser-facing visual roll:

- Deep green printer head and dark slot, with the receipt visually
  unfurling down the page using CSS keyframes.
- Browser screen gains warm paper framing and a soft print-roll shadow.
- **Real receipt printing remains unchanged**: @media print completely
  removes the decorative printer, animation, clipping, margins and shadow.
  80 mm thermal paper is not obscured or clipped.
- Users preferring reduced motion get the complete static receipt.
- Ghana Cedi amounts use ₵, comma grouping and exactly two decimals.
- Product and customer data remain HTML-escaped.
- The immutable sale-time totals, confirmed counted cash, exact stock
  depletion and sale idempotency contracts are not altered.
- The existing POS endpoint remains administrator-only and inaccessible
  without authorization. No sale/create/payment/refund/stock operations
  or customer messaging are added.

This HTML intentionally has **no JavaScript, CDN dependency, QR code,
remote font, analytics or new network fetch**. The animation is cosmetic
and triggers only when an authorized browser opens its immutable receipt.

## Verification

The 5 offline tests in
`scripts/pos-thermal-receipt-motion.test.ts` check browser roll,
print safety, reduced-motion fallback, formatted prices, hostile-content
escaping and existing total consistency. Run with:

```bash
bun test scripts/pos-thermal-receipt-motion.test.ts
```

GitHub API Foundation integration/security CI still must pass on the PR's
exact SHA. Test a real 58/80 mm thermal printer and Android print/PDF
browser combinations before enabling any cashier transaction flow.

## No-go and external blockers

Public varietygroceries.com remains Coming Soon. The running POS
integrated staging (3049/3052) is from a different, unmerged worktree,
so this source change must **not** silently replace those services.
POS parity/recovery remains issue #108; Hubtel authorization remains #90
(HTTP 403 at prior check). No live transactions, stock changes or payments
were made in building this visual improvement.
