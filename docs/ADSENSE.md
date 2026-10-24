# Google AdSense configuration

The storefront is AdSense-ready but intentionally does not ship a fake publisher ID.
Ads remain disabled until the real AdSense values are supplied at build time.

## Required values

- `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX`
- `NEXT_PUBLIC_ADSENSE_HOME_TOP_SLOT=<numeric ad-unit slot>`
- `NEXT_PUBLIC_ADSENSE_HOME_MID_SLOT=<numeric ad-unit slot>`
- `NEXT_PUBLIC_ADSENSE_HOME_BOTTOM_SLOT=<numeric ad-unit slot>`
- `NEXT_PUBLIC_ADSENSE_SHOP_TOP_SLOT=<numeric ad-unit slot>`
- `ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX` for the runtime `/ads.txt` response (use the same client ID)

The four slot variables are optional independently. A missing/invalid slot renders nothing, so customers never see empty ad placeholders.

## Build requirement

`NEXT_PUBLIC_*` values are embedded by Next.js during `next build`. Export the real values before running the production portal build. `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` must still be set to the existing production values.

Example (replace every placeholder with values copied from the AdSense account):

```bash
export API_BASE_URL=http://127.0.0.1:3027/api/v1
export NEXT_PUBLIC_API_BASE_URL=https://portal.varietygroceries.com/api/v1
export NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
export ADSENSE_CLIENT="$NEXT_PUBLIC_ADSENSE_CLIENT"
export NEXT_PUBLIC_ADSENSE_HOME_TOP_SLOT=0000000000
export NEXT_PUBLIC_ADSENSE_HOME_MID_SLOT=0000000000
export NEXT_PUBLIC_ADSENSE_HOME_BOTTOM_SLOT=0000000000
export NEXT_PUBLIC_ADSENSE_SHOP_TOP_SLOT=0000000000
bun run build
```

## What the application does

- Loads the official asynchronous `adsbygoogle.js?client=ca-pub-...` code site-wide only when the client ID format is valid.
- Renders responsive ad units in separated home/shop positions only when both client and slot are valid.
- Serves `/ads.txt` as `google.com, pub-..., DIRECT, f08c47fec0942fa0` when `ADSENSE_CLIENT` or `NEXT_PUBLIC_ADSENSE_CLIENT` is configured.
- Returns HTTP 404 from `/ads.txt` while AdSense is not configured, instead of advertising a fake seller ID.
- Preserves configured AdSense environment lines when the standard portal rollout script rewrites `portal.env`.

Before enabling ads, add the production domain to AdSense, complete Google's site review/verification, and copy the publisher/slot values from that account. Never copy example `ca-pub` IDs from documentation.
