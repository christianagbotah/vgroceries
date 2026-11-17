# Variety Groceries — product-media validation, mobile dialogs and homepage slider

Date: 17 November 2026.
Source branch: feat/storefront-polish-media-slider-mobile-20261117
Base: the exact POS-integrated code branch used for deployed release fd4a845
plus existing source-only operations audit notes. Public Coming Soon unchanged.

## Product image generation

The browser supplied the generation idempotency key in BOTH the HTTP header
and JSON body via the generic normalizedRequestBody helper. The strict
CreateGenerationRequest schema does not accept a body field named
idempotencyKey, reproducing the user's error. The fix keeps the header-only
key on this operation, preserves the other body fields, and maintains mock
replay semantics by adding the key to the mock engine only AFTER strict
schema validation. The API controller already expects the key in the header.

This fixes request validation; **actual AI image availability additionally
depends on the configured generation provider and credits/API permissions**.
No generation job was submitted to production for this patch.

## Storefront carousel

- The landing hero uses CMS-published headline and CTAs first.
- Fresh produce and pantry creative become the next two slides.
- Up to three currently saleable real catalogue products provide additional
  slides, using *approved featured product media* first, otherwise the
  existing catalogue image. No unapproved media is shown.
- Automatic 6.2 s fades with previous/next buttons, slide dots, pause/play,
  no autoplay when reduced motion is requested, and pause while focused,
  hovered or the browser tab is hidden.
- Existing shop/product/category navigation and live stock authority are
  unchanged. Images are not fabricated by the slideshow.
- A future CMS-controlled campaign/banner upload can supply custom ad
  creatives; the current implementation uses curated image assets and
  existing catalog-approved media, not a new database content model.

## Narrow storefront navigation and overflow

- Reduces the mobile left drawer to 78vw with a 286 px cap.
- Groups and icons organize product departments, shopping help and account
  actions; independently scrollable menu and branded footer are retained.
- Shared Radix select primitive limits selected text to the trigger width
  with ellipsis and constrains option content to the viewport.
- Dispatch dialogs constrain width and wrap long descriptions, while
  selected provider and rider labels remain accessible.

## Scope and release gates

Frontend-only. No production stock mutation, provider/API credential
change, migrations, POS service restart, checkout authority or public
Coming Soon cutover. Require strict request contract regressions,
lint, typecheck, production Next build and mobile (360/390 px)
dialog/hero/menu browser checks before portal-only rollout with rollback.

## Mobile UAT refinement

At 390px the first Chromium test measured a dispatch dialog width of 390px
rather than the desired 358px, even though document overflow stayed at 390px.
The generic Radix Dialog base and both dispatch assignment/manage dialogs
now use explicit viewport-minus-2rem width, capped at 28rem for dispatch,
retaining a consistent 16px gutter on each side.

The follow-up 390px browser test showed the modal itself at 358px but
a Radix SelectTrigger stretching to 484px due to the implicit CSS grid
track's min-content width. The shared DialogContent now explicitly uses
grid-template-columns: minmax(0, 1fr), with shrinkable dialog section
wrappers. This fixes the intrinsic layout constraint instead of merely
clipping long text.

## Actual POS portal deployment and evidence — 17 November 2026

**Immutable deployed application commit:** 67936ce797db7c58bf32631f97617f3a6f295ea7.
**Release directory:** /home/lightworld/releases/varietygroceries-portal-storefront-polish-67936ce-20261117.
**Unit:** varietygroceries-portal-canonical.service (port 3052).
**Override:** 99-storefront-polish-20261117.conf.
**Previous release preserved:** /home/lightworld/releases/varietygroceries-portal-pos-retry-fd4a845-20261117.

The override changes only the portal working directory, not the API 3049,
public Coming Soon site, payment handlers, stock ledger, schema, staff roles
or transaction feature flags.

Completed release gates:
- 18 targeted media/studio/hero/mobile contract tests / 125 assertions passed.
- Follow-up mobile dialog source tests passed after each refinement.
- Targeted ESLint and full TypeScript checks passed.
- Next.js 16.1.3 production build passed for the deployed SHA; 63 static
  pages generated, including POS, dispatch, product editing, checkout,
  inventory and staff routes.
- Production-mode isolated release on port 3094: HTTP 200 on /, /shop,
  /cart, /checkout, /staff/login, /admin/pos, /admin/dispatch,
  /admin/products and /staff/demo/dispatcher.
- Chromium canary browser: six populated carousel slides, manual advance,
  pause stability, 360px menu width approximately 280.8px, 390px menu
  width 286px, zero document horizontal overflow, and long external
  provider selection inside 358px dialog / 308px trigger at 390px viewport.
  These checks used demo staff session data; no dispatch job was assigned.
- Live portal after rollout: HTTP 200 on shop, cart, checkout, staff
  login, POS, dispatch and product pages. Public portal homepage retained
  the existing quick-basket and new carousel markup. Public main domain
  continued to show Coming Soon.
- Public HTTPS portal also passed Chromium browser checks for six-slide
  hero advance/pause and mobile menu at 360px/390px without page overflow.
- Production POS API not changed or restarted.

Rollback: remove
/etc/systemd/system/varietygroceries-portal-canonical.service.d/99-storefront-polish-20261117.conf,
run systemctl daemon-reload, then restart only
varietygroceries-portal-canonical.service. The existing 95-pos-retry-safety
override restores the prior immutable release. Do not use 3037/3027
legacy rollout scripts.

**AI provider limitation:** The currently running POS staging API has
AI_IMAGE_PROVIDER=fake and no configured OpenAI provider credential.
The strict request-validation defect is fixed, but genuine model-generated
product images are not available until an approved real provider and
credentials are configured. This release does not submit real paid image
generation jobs or silently publish unapproved media.
