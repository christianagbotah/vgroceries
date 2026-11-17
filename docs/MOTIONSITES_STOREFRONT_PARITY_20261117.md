# Variety Groceries — MotionSites reference and storefront parity

Date: 17 November 2026 (Africa/Accra)
Status: POS-integrated frontend feature branch, not yet released.
Reference: https://motionsites.ai/ and https://studio.motionsites.ai/

## Reference findings

MotionSites.ai showcases design prompts and motion-oriented prototypes, including ecommerce product treatments, interactive heroes and editorial visual transitions. These are inspiration for an original design system; no paid MotionSites prompts, templates, videos or licensed assets were copied.

The owner's experience goals are:
- Premium animated public shop and product gallery, excellent images and transitions
- A product visibly flying into cart on successful add, with cart feedback
- Accessible detail gallery (touch swipe, directional navigation, zoom)
- A receipt that elegantly rolls into view and offers print/download/QR formats
- Distinctive on-brand presentation, including the approved official gold VG lockup

## Canonical vs deployed POS-integrated parity audit

Canonical GitHub main already has reviewed foundations from PR #123 (cinematic site, gallery, cart flight and customer receipt QR), PR #124 (thermal receipt preview), PR #125 (quick basket) and draft PR #126 (product Quick Look). The production-safe POS-integrated portal runs a separate source track. Do not replace that runtime with canonical main or silently discard its 24 pre-existing uncommitted changes.

This branch reconciles ONLY the following presentation features into the POS-integrated track:

1. Port canonical gallery with approved-media priority, true fallback attribution, animated image transitions, on-device swipe, keyboard left/right, thumbnail navigation, and enlarged image dialog. Motion prefers reduced-motion settings and never fabricates additional product angles.
2. Port the already-reviewed cart flight helper and motion cart icon. An accepted product image flies toward the correct desktop/mobile cart, which pulses and updates its badge. Decorative motion does not create any cart change.
3. Integrate with the POS-specific live-SKU stock refresh and stock-limit checks rather than replacing those newer transaction safeguards. Both product grid and variant purchase panel call animation only after Zustand cart accepted the addition.
4. Retain approved gold VG logo in header/footer and staff-side icons, unchanged guest checkout CSRF token retry, all route guardrails, and existing POS/customer-data contracts.

## Important unfinished items

- Canonical quick basket / quick look: still require reconciliation with POS-specific stock recheck, customer rights and responsive layout before enabling on this deployment.
- Customer-order roll-down receipt + QR + PDF: canonical implementation exists, but needs source parity check and order-status honesty on this POS-integrated track before release. No demo receipt can be presented as paid proof.
- Thermal POS receipt motion/printing: canonical PR #124, not ported here; must keep actual 58/80mm print media unchanged.
- Product photography: only approved real SKU photos should be used for variant-specific images; original animation must not synthesize pack details.
- A paid MotionSites subscription is **not** required to implement these original UI effects.

## Release gates

Targeted tests, TypeScript compilation and GitHub Actions isolated production build; same 87 routes; exact source commit / artifact checksum; isolated localhost HTTP checks; browser desktop/mobile if available; rollback to the current official gold VG POS-integrated release a74c2ef. Do not restart/replace API 3049 or open the Coming Soon site. No order, payment, Hubtel or stock changes for an animation-only rollout.
