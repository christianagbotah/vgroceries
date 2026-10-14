# Product Media AI Studio Runbook

## Scope

This runbook covers UAT and production operation of Variety Groceries Product Media: uploads, AI image generation, review/approval, public serving, legacy-image import, worker operation, rollback, and storage cutover.

The storefront may read only approved `ProductMedia`. Draft, review, rejected, and archived media are never public authority. `Product.image` remains a temporary fallback until every published product has approved media and the coverage gate has passed for one full UAT cycle.

## UAT storage layout

Stable filesystem root:

```text
/home/lightworld/data/varietygroceries/product-media/
├── private/   # upload/AI review candidates; never mapped by Nginx
└── public/    # approved immutable media only
```

Ownership and permissions:

```bash
install -d -o lightworld -g lightworld -m 0750 /home/lightworld/data/varietygroceries/product-media
install -d -o lightworld -g lightworld -m 0750 /home/lightworld/data/varietygroceries/product-media/private
install -d -o lightworld -g lightworld -m 0755 /home/lightworld/data/varietygroceries/product-media/public
```

The stable media root must not live inside a release directory. Release switches and application restarts must leave it intact.

## UAT API configuration

Use a server-only environment file such as `/home/lightworld/config/varietygroceries/api.env` and protect it from non-service users.

```dotenv
PRODUCT_MEDIA_STORAGE=filesystem
PRODUCT_MEDIA_FILESYSTEM_ROOT=/home/lightworld/data/varietygroceries/product-media
PRODUCT_MEDIA_PUBLIC_BASE_URL=https://portal.varietygroceries.com/media/products/
AI_IMAGE_PROVIDER=fake
AI_IMAGE_MODEL=fake-image-v1
AI_IMAGE_TIMEOUT_MS=60000
AI_IMAGE_MAX_CANDIDATES=4
AI_IMAGE_WORKER_POLL_MS=2000
```

Keep OpenAI disabled for the first UAT pass. The fake provider gives deterministic candidates without external credentials or network dependency.

## Worker install and restart

Install the unit from `deploy/systemd/varietygroceries-media-worker.service`, ensuring the `current` API symlink points at the same release used by the API service.

```bash
sudo cp deploy/systemd/varietygroceries-media-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now varietygroceries-media-worker.service
sudo systemctl status varietygroceries-media-worker.service
```

For a controlled restart:

```bash
sudo systemctl restart varietygroceries-media-worker.service
journalctl -u varietygroceries-media-worker.service -n 100 --no-pager
```

The process receives SIGTERM and has 30 seconds to stop cleanly. Generation jobs remain PostgreSQL-backed and can be resumed after restart without duplicating completed candidates.

## Nginx public media serving

Include `deploy/nginx/varietygroceries-product-media.conf` inside the HTTPS `portal.varietygroceries.com` server block, then validate before reloading:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Only `/home/lightworld/data/varietygroceries/product-media/public/` is aliased. Never add an alias for `private/`, draft, review, or worker scratch data.

Smoke checks:

```bash
curl -I https://portal.varietygroceries.com/media/products/<approved-object>
curl -i https://portal.varietygroceries.com/media/private/example.webp
curl -i -X POST https://portal.varietygroceries.com/media/products/example.webp
```

Expected: approved public media is readable with GET/HEAD; private-style paths are unavailable; writes through Nginx are denied.

## Legacy product-image import

The importer accepts only local paths already owned by the application public tree. External `http://`, `https://`, protocol-relative, `data:`, `file:` and traversal paths are skipped.

Build first, then run from `apps/api`:

```bash
npm run build
LEGACY_PRODUCT_MEDIA_ROOT=/path/to/release/public \
LEGACY_PRODUCT_MEDIA_REVIEW_POLICY=draft \
npm run media:import-legacy
```

`draft` is the safe default: normalized images enter private storage as `source=legacy_import` and remain unapproved for human review in Product Media Studio.

An explicit migration decision may use:

```bash
LEGACY_PRODUCT_MEDIA_REVIEW_POLICY=approve npm run media:import-legacy
```

That mode writes approved/public media and is intentionally not the default. It does not automatically make an image featured. Use it only when the source-image ownership and product/image mapping have already been reviewed.

The importer is idempotent for the same product and normalized SHA-256 and audits each new import.

## Fake-provider UAT flow

Complete this before enabling OpenAI:

1. Create an unpublished product draft in Admin → Products.
2. Upload a genuine image; verify it appears only in review candidates.
3. Queue 1–4 fake AI candidates and verify the worker transitions the job to completed.
4. Approve one candidate and verify its storage object moves to the public namespace.
5. Set it as featured and reorder the gallery.
6. Open the storefront product page and confirm only approved media is visible.
7. Reject another review candidate and confirm it never becomes public.
8. Archive/replace the featured image and confirm storefront fallback remains valid.
9. Restart API and worker; repeat storefront/media checks to prove stable media storage survives release changes.

## Enabling OpenAI after fake-provider UAT

Only after the fake-provider flow passes, configure a server-side key:

```dotenv
AI_IMAGE_PROVIDER=openai
AI_IMAGE_MODEL=gpt-image-2
OPENAI_API_KEY=replace_with_server_secret
```

Restart the API and worker after changing the environment. Never place the key in frontend environment variables, Git, CI logs, browser payloads, or generated media metadata.

Perform exactly two initial provider checks outside CI:

- one unbranded grocery product generation;
- one branded-packshot edit using a genuine uploaded reference image.

Branded generation without a genuine reference must continue to fail with `REFERENCE_IMAGE_REQUIRED`.

## Key rotation

1. Put the replacement provider/storage credential into the protected server environment.
2. Restart the worker first and verify it can process a fake/test-safe job or provider health path.
3. Restart the API.
4. Revoke the old credential only after both processes are healthy.
5. Record the change in the operational audit/change log. Never print secret values.

## Orphan cleanup

The services compensate for failed database writes by deleting unreferenced storage objects when safe. Operational cleanup must still be conservative:

1. Enumerate storage keys.
2. Compare them to `ProductMedia.storageKey` in PostgreSQL.
3. Never delete an object referenced by any row, including archived rows retained for audit.
4. Quarantine suspected orphans before permanent deletion.
5. Never scan or expose the private tree through Nginx to perform cleanup.

## S3-compatible production cutover

Production launch requires S3-compatible storage rather than filesystem authority.

Configure the complete bundle:

```dotenv
PRODUCT_MEDIA_STORAGE=s3
PRODUCT_MEDIA_S3_ENDPOINT=https://s3.example.com
PRODUCT_MEDIA_S3_REGION=auto
PRODUCT_MEDIA_S3_BUCKET=variety-products
PRODUCT_MEDIA_S3_ACCESS_KEY_ID=replace_me
PRODUCT_MEDIA_S3_SECRET_ACCESS_KEY=replace_me
PRODUCT_MEDIA_PUBLIC_BASE_URL=https://media.varietygroceries.com/products/
```

Copy immutable objects preserving their storage keys, verify checksums/counts, then switch API/worker configuration together. Private objects must remain non-public at the bucket/CDN policy layer.

## Rollback

Application rollback must not roll back or delete the stable media root.

1. Stop the media worker if the new worker code is implicated.
2. Switch the API/web release symlink back to the last verified release.
3. Restart API/web services.
4. Keep PostgreSQL migrations forward-compatible; do not manually drop Product Media tables during incident rollback.
5. Keep approved public objects and private candidates intact unless a specific corrupt object is identified.
6. Verify storefront catalogue, checkout, account/orders, public media GETs, and private-media denial.
7. Restart the worker only when its code/config is known compatible with the current schema.

## Final verification checklist

Before promotion, run:

```bash
bun test
bunx tsc --noEmit
bun run lint
bun run build
npm test --prefix apps/api
npm run --prefix apps/api migrate:deploy
npm run --prefix apps/api openapi
git diff --check
```

Also verify migration status, deterministic OpenAPI, HTTP permission checks for admin/inventory/customer roles, worker restart behavior, public-only media serving, and desktop/mobile browser QA of Product Media Studio and the storefront product gallery.

Do not remove the temporary storefront fallback imagery until every published product has approved media and the media-coverage report remains complete for one full UAT cycle.
