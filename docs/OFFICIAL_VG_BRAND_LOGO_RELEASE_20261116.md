# Variety Groceries — official gold VG brand rollout

Date: 16 November 2026
Scope: POS-integrated storefront branding only. No checkout, stock, payments or database changes.

## Official assets

The owner-approved logo has a metallic gold VG shield-like monogram and black, two-line Variety Groceries wordmark. Public Coming Soon already serves:

- logo.svg SHA256 745d4b4bacb8707c144555e11c122d3bac5fad8684562ab78f1c4930d892d92e
- variety-lockup.svg SHA256 eb6f044400af86f14ae8425ebc130e7ca6261c3450169da098949fc6b9140a0c

Canonical main adopted this exact artwork in PR #127. The separately released POS-integrated portal, build 18bd5b6, still compiled the older green V plus improvised one-line wordmark.

## Changes

- Replace public/logo.svg and public/brand/variety-mark.svg with exact official gold VG monogram. Preserve both existing URLs for favicon and cart fallback compatibility.
- Add public/brand/variety-lockup.svg from the official approved artwork.
- Copy the canonical already-reviewed Brand header/mobile/footer component, displaying the real complete logo and a white backing in the dark footer.
- Align the source Coming Soon assets and favicon with the actual public page.
- Preserve the POS-integrated shopping/checkout version, its CSRF retry, and all other routes. No API/client contract mutation.
- Use GitHub Actions to build instead of competing for VPS CPU.

## Live status and release gate

The active portal at 3052 now serves the gold mark in /logo.svg and /brand/variety-mark.svg after atomic static-file replacement, with backups at /home/lightworld/backups/varietygroceries/logo-replacement-20261116T2300Z. No restart needed. New SVG URL /brand/variety-lockup.svg requires a compiled release; an unbuilt new public file can return 404.

Before deploying the full lockup, require a clean exact-head GitHub Actions build, artifact SHA verification, all 87 deployed routes retained, isolated port browser checks for header, checkout and staff POS, and rollback to the previous stable 18bd5b6 release. Verify desktop/mobile layout and keep public Coming Soon unchanged. No order, payment, Hubtel or stock change is authorized by this branding release.

## Testing

Focused identity, Coming Soon, rich storefront and CSRF regressions: 26 passed, 0 failed. Lint and git diff checks passed. Clean remote build and functional browser checks are additional gates.

## Staff/POS completion follow-up

The primary site/header/footer logo was deployed as approved build 84e00d4.
One further scan found plain V placeholder badges in the admin sidebar,
staff login, read-only cashier workspace and rider header. This change
replaces all four with the same approved SVG lockup or its matching
monogram, leaving routes and business logic untouched. The staff login
uses the full logo, and the admin sidebar uses a compact full logo;
smaller cashier/rider headers use the official monogram with existing
workspace labels. No extra dependencies or external images.

The final release must again pass a remote build, exact source-SHA
checksum, route-parity and staff/checkout smoke before switch, with
84e00d4 retained for rollback.
