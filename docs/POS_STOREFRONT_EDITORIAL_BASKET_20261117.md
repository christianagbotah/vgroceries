# POS-integrated storefront editorial homepage & quick basket

Date: 17 November 2026
Branch: feat/pos-integrated-editorial-basket-20261117
Source: current active POS-integrated portal commit b7b7962; selective visual port
from canonical storefront 24084b9, not a replacement of the portal or API.

## Implemented source changes

- Replaces only the existing hero in the POS portal home with the accessible
  editorial grocery hero from canonical source. Existing categories, product
  cards, customer flows, cashier and administrator pages are preserved.
- Adds a separate quick-basket button without changing the /cart link.
- Shows one dock in the existing storefront layout after the role/demo notice,
  cart and the voice concierge. Uses local cart snapshots only, not stock/payment
  authority. Always shows an estimate, not a confirmed payable quote.
- Uses the existing accepted cart-flight event and suppresses duplicate success
  toasts in POS product and product-detail cards. Stock/verification failure
  feedback remains visible.
- Keeps the active official metallic-gold VG logo and its existing appearances.

## Release boundary

Do not replace the public coming-soon landing page. Portal 3052 uses its own
POS-integrated API 3049. The legacy 3037/3027 rollout is explicitly forbidden
without prior source/data/role parity sign-off. Build, tests, mobile browser UAT
and immutable release/rollback evidence are required before changing 3052.
Do not update payment credentials, operate payment callbacks, apply migrations
or activate operational feature flags for this visual change.
