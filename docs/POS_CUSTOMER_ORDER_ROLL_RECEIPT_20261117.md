# POS-integrated customer order receipt motion — 17 Nov 2026

Ported reviewed canonical PR #123 receipt component into the actively deployed POS-integrated source track, without replacing its cart/checkout/stock authority. The animated receipt preview appears on checkout order-status screen and signed-in account order detail. A new Qrcode dependency is pinned at 1.5.4 and its type definition at 1.5.6; QR is generated on device only, pointing to same-origin authenticated order details.

## Features
- Animated thermal-paper reveal with reduced-motion support
- Print or Save as PDF through browser print, no payment processing
- Download complete offline HTML receipt and plain-text receipt
- Download QR PNG pointing to same-origin /account/orders/<order_id>
- Live data from server-returned PublicOrder; pending, failed, refunded or under-review states are labelled order summaries and NOT PROOF OF PAYMENT; paid/partially-refunded states reflect verified current server status. No client-side payment promotion
- Escapes untrusted customer and product text in exported HTML; no external scripts or QR services

## Scope boundary
This is a customer order preview, not a counter POS printed receipt. The POS hardware receipt preview from canonical PR #124 must be reconciled separately with the active POS API 3049, its thermal printer widths, role guards, refunds and immutable transaction proof. Not a tax invoice; no live payment/order/stock mutation made by this branch.

## Release gates
Exact-head GitHub typecheck/production build/tests, artefact SHA/checksum verification, 87 route parity, isolated localhost smoke on `/checkout/status/[id]` and `/account/orders/[id]` (authenticated routes redirect when logged out), and preservation of gold logo/motion cart. Keep previous f26d5e5 release for rollback. Public varietygroceries.com stays Coming Soon.
