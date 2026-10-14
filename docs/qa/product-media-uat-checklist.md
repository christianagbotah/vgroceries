# Product Media AI Studio — UAT Verification Checklist

Date: 2026-10-14

## Repository / CI evidence

- [x] Shared Product Media contracts and Prisma authority implemented.
- [x] Upload validation/storage adapters implemented.
- [x] Review/approve/reject/archive/featured/gallery/brand-mode authority implemented.
- [x] Provider-neutral AI image generation with fake and OpenAI adapters implemented.
- [x] PostgreSQL-backed generation jobs and media worker implemented.
- [x] Admin Product Media Studio and Add Product draft workflow implemented.
- [x] Storefront reads approved featured/gallery media first and keeps legacy fallback.
- [x] Legacy local-image importer implemented with external/traversal rejection and explicit review policy.
- [x] UAT filesystem, Nginx public-only alias, systemd worker template, and operational runbook implemented.
- [x] Product-media coverage report implemented (`npm run media:coverage`; add `-- --require-full` when enforcing the final coverage gate).
- [x] Frontend CI: lint, TypeScript, production build, regression suites and route sweep green on Task 12 implementation head.
- [x] API foundation: migrations, complete API/security tests and deterministic OpenAPI green on Task 12 implementation head.

## VPS deployment checks

These are executed on UAT after the branch is merged/deployed. Do not mark them complete from repository-only evidence.

- [ ] Apply Product Media Prisma migration to UAT PostgreSQL and confirm migration status.
- [ ] Create `/home/lightworld/data/varietygroceries/product-media/{private,public}` with `lightworld` ownership.
- [ ] Configure filesystem Product Media bundle and `AI_IMAGE_PROVIDER=fake` in the protected API environment.
- [ ] Install/reload Nginx public-media alias and confirm private/review paths are not exposed.
- [ ] Install/start `varietygroceries-media-worker.service`; confirm restart-on-failure and graceful SIGTERM.
- [ ] Confirm API and worker use the same release/config and release switches leave the stable media root intact.
- [ ] Run legacy import in `draft` mode and review candidates in the backoffice before any explicit approval policy is used.

## End-to-end UAT flow

- [ ] Create unpublished product draft.
- [ ] Upload genuine image and confirm authenticated review-only preview.
- [ ] Generate deterministic fake candidates and confirm queued → completed worker lifecycle.
- [ ] Approve one candidate; verify immutable public object is reachable.
- [ ] Set featured media and reorder gallery.
- [ ] Verify storefront shows approved featured/gallery media only.
- [ ] Verify rejected/private candidates never appear publicly.
- [ ] Archive/replace featured media and verify storefront remains valid.
- [ ] Restart API/worker and confirm Product Media survives release/service restart.

## OpenAI provider UAT

Perform only after fake-provider UAT is complete and a server-side key is configured.

- [ ] Generate one unbranded grocery product image.
- [ ] Perform one branded-packshot edit using a genuine uploaded reference.
- [ ] Verify branded generation without a reference fails closed with `REFERENCE_IMAGE_REQUIRED`.
- [ ] Confirm no provider credential appears in browser payloads, logs, Git, CI or media metadata.

## Coverage gate

Run:

```bash
cd apps/api
npm run build
npm run media:coverage
npm run media:coverage -- --require-full
```

The last command must return success before the temporary storefront fallback imagery can be removed. Keep the fallback for at least one full UAT cycle after coverage first reaches 100%.
