# Product Media AI Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-backed Product Media AI Studio that lets authorized staff upload, generate, review, approve, feature, and order product images while exposing only approved media to the storefront.

**Architecture:** PostgreSQL owns media/job state; binary image bytes live behind a `ProductMediaStorage` adapter; generation is queued in PostgreSQL and processed by a separate worker through a provider-neutral `ImageGenerationProvider`. The admin Next.js app talks only through shared contracts/service adapters, while the public catalogue dual-reads approved media first and the legacy image fallback second.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, NestJS 11, Prisma 7 + PostgreSQL, Bun frontend tests, Node test runner for API integration tests, Sharp, OpenAI SDK, AWS SDK S3 client, Nginx, systemd.

**Spec:** `docs/superpowers/specs/2026-10-14-product-media-ai-studio-design.md`

## Global Constraints

- PostgreSQL remains authoritative for media state, approval, ordering, featured selection, jobs, and provenance.
- Product binaries never live in PostgreSQL and provider hotlinks never become storefront authority.
- AI output is never auto-published; generated/uploaded candidates enter review state first.
- Provider credentials are server-only; CI uses only `FakeImageGenerationProvider`.
- Branded packaged goods require a genuine reference image for AI editing; fake branded packaging is prohibited.
- Ingestion accepts JPEG, PNG, and WebP only, max 12 MiB and max 6000×6000; actual bytes/dimensions must be decoded and validated.
- Generation is asynchronous with at most three total attempts for transient provider/storage failures.
- UAT may use stable filesystem media storage; production launch requires S3-compatible storage.
- `Product.image` remains readable as a migration fallback until a later cleanup release.
- Pricing, inventory, checkout, orders, fulfilment, returns, and payment authority must remain unchanged.

## Review Focus

- A branded generation request without a genuine reference must return `REFERENCE_IMAGE_REQUIRED` without creating a queued job.
- Corrupt, SVG, oversized, or over-dimension uploads must leave neither a `ProductMedia` row nor a stored object.
- If object storage succeeds and the database write fails, compensation must delete the orphaned object when safe.
- Two workers racing for the same queued generation must never process the same job twice.
- Cross-product media IDs, unapproved featured selections, and archive/reorder races must fail atomically without leaking another product's metadata.

## File Map

- Shared contracts: `packages/contracts/src/catalog-media.ts`, `catalog.ts`, `validation.ts`, `endpoints.ts`, `index.ts`.
- Database authority: `apps/api/prisma/schema.prisma` plus one numbered migration.
- Production API: `apps/api/src/product-media/*`, `apps/api/src/catalog-admin/*`, `apps/api/src/identity/*`, `apps/api/src/config.ts`, `apps/api/src/bootstrap.ts`.
- Worker: `apps/api/src/media-worker.ts` plus `product-media/generation-worker.service.ts`.
- Frontend transport/contracts: `src/services/client.ts`, `src/services/adapters/*`, `src/services/mock/*`, `src/services/operation-registry.ts`.
- Admin UI: `src/app/admin/products/page.tsx`, `src/app/admin/products/[id]/page.tsx`, `src/features/catalog/product-media-studio.tsx` and focused child components.
- Public storefront: `apps/api/src/catalog/catalog.service.ts`, shared catalogue contract, `src/features/catalog/product-tile.tsx`, `src/app/(storefront)/products/[slug]/page.tsx`.
- Deployment: `deploy/systemd/`, `deploy/nginx/`, API env examples, and a media runbook.

---

### Task 1: Shared Media Contracts and Prisma Schema

**Files:**
- Create: `packages/contracts/src/catalog-media.ts`
- Modify: `packages/contracts/src/catalog.ts`
- Modify: `packages/contracts/src/validation.ts`
- Modify: `packages/contracts/src/endpoints.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610140007_product_media_authority/migration.sql`
- Test: `apps/api/test/product-media-schema.spec.ts`

**Interfaces:**
- Produces `CatalogMediaImage`, `ProductMediaView`, `ImageGenerationJobView`, `AdminProductMediaView`, `CreateProductDraftRequest`, `CreateGenerationRequest`, `SetFeaturedMediaRequest`, and `ReorderGalleryRequest`.
- Adds `Product.featuredMediaId`, `Product.brandMode` (`auto | unbranded | branded`), `ProductMedia`, and `ImageGenerationJob` while preserving `Product.image`.

- [ ] **Step 1: Write failing schema/contract tests** asserting the migration creates the two tables, product featured relation, required status/source/job fields, unique storage key, job candidate count, and exported request/response types.
- [ ] **Step 2: Run** `cd apps/api && npm run build && node --test --test-concurrency=1 dist/test/product-media-schema.spec.js` and confirm failure because the models/contracts do not exist.
- [ ] **Step 3: Add shared media contracts and strict Zod request schemas.** Pin `mode` to `unbranded_generation | branded_packshot_edit`, style to the four approved presets, `backgroundIntent` to `auto | plain | grocery_shelf | kitchen_counter | market_display`, candidate count to 1–4, operator note to 500 characters, and product brand mode to `auto | unbranded | branded`.
- [ ] **Step 4: Add Prisma models/relations and migration.** Use named relations for product collection, featured media, job candidates, and job reference media so Prisma has no ambiguous cycles.
- [ ] **Step 5: Apply the migration to the isolated test database and run the new schema test plus shared-contract build.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: add product media data contracts`.

### Task 2: Catalogue Permissions and Media Configuration

**Files:**
- Create: `apps/api/src/identity/permissions.ts`
- Modify: `apps/api/src/identity/access.guard.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/.env.example`
- Test: `apps/api/test/product-media-permissions.spec.ts`
- Test: `apps/api/test/product-media-config.spec.ts`

**Interfaces:**
- Produces `PermissionName`, `hasPermission(role, permission)`, `ProductMediaConfig`, and optional `ImageGenerationConfig` in `ApiConfig`.
- Catalogue media permissions are `catalog.media.read`, `catalog.media.generate`, `catalog.media.upload`, `catalog.media.approve`, `catalog.media.publish`.

- [ ] **Step 1: Write failing permission tests** for admin full access, inventory manager read/upload/generate but no approve/publish, and customer/rider denial.
- [ ] **Step 2: Write failing config tests** for filesystem and S3 bundles, optional AI provider, invalid candidate/timeout values, and missing OpenAI key when `AI_IMAGE_PROVIDER=openai`.
- [ ] **Step 3: Run both tests** and confirm they fail on missing permission/config types.
- [ ] **Step 4: Implement central role-permission mapping and make `Permission()` accept `PermissionName` instead of the current inventory-only union.**
- [ ] **Step 5: Extend `readConfig()`** with validated media storage, AI provider/model, generation timeout, maximum candidates (hard cap 4), and worker poll interval. Filesystem remains valid for UAT even under production runtime; launch readiness, not `NODE_ENV`, determines S3 cutover.
- [ ] **Step 6: Run permission/config tests and existing identity/config tests.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: add catalogue media permissions and config`.

### Task 3: Image Validation and Storage Adapters

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/product-media/product-media.storage.ts`
- Create: `apps/api/src/product-media/filesystem-product-media.storage.ts`
- Create: `apps/api/src/product-media/s3-product-media.storage.ts`
- Create: `apps/api/src/product-media/image-validation.ts`
- Create: `apps/api/src/product-media/storage-key.ts`
- Test: `apps/api/test/product-media-storage.spec.ts`
- Test: `apps/api/test/product-media-image-validation.spec.ts`

**Interfaces:**
- `ProductMediaStorage.put(input: { key: string; bytes: Buffer; contentType: string; visibility: "private" | "public" }): Promise<StoredMedia>`
- `read(storageKey: string): Promise<Buffer>` for authenticated review/promotion only.
- `delete(storageKey: string): Promise<void>`
- `publicUrl(storageKey: string): string` rejects private keys and returns a URL only for the public namespace.
- `exists(storageKey: string): Promise<boolean>`
- `validateAndNormalizeProductImage(bytes: Buffer): Promise<ValidatedProductImage>` returns normalized bytes, MIME, width, height, byte size, SHA-256.

- [ ] **Step 1: Add failing tests** for valid JPEG/PNG/WebP, SVG rejection, corrupt bytes, >12 MiB source, >6000 dimension, deterministic SHA-256, immutable key generation, filesystem traversal resistance, private-key refusal from `publicUrl()`, private/public namespace separation, and S3 key/public URL formation.
- [ ] **Step 2: Run the tests** and confirm missing-interface failures.
- [ ] **Step 3: Add `sharp`, `@aws-sdk/client-s3`, and the minimal required typings/dependencies to `apps/api/package.json`.**
- [ ] **Step 4: Implement byte-level decode/validation and normalize accepted images to storefront-safe WebP while preserving dimensions within configured derivative bounds.**
- [ ] **Step 5: Implement filesystem and S3 adapters.** Filesystem storage has non-public `private/` and Nginx-served `public/` namespaces outside release directories; both adapters use server-generated immutable keys only.
- [ ] **Step 6: Run storage/validation tests and API build.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: add product media storage and image validation`.

### Task 4: Production Product Draft, Media Read, and Upload Authority

**Files:**
- Create: `apps/api/src/catalog-admin/catalog-admin.service.ts`
- Create: `apps/api/src/catalog-admin/catalog-admin.controller.ts`
- Create: `apps/api/src/catalog-admin/catalog-admin.module.ts`
- Create: `apps/api/src/product-media/product-media.service.ts`
- Create: `apps/api/src/product-media/product-media.controller.ts`
- Create: `apps/api/src/product-media/product-media.module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/test/product-media-upload.spec.ts`
- Test: `apps/api/test/catalog-admin-product-draft.spec.ts`

**Interfaces:**
- `CatalogAdminService.createDraft(actorId, input): Promise<{ productId: string; editorPath: string }>`
- `ProductMediaService.viewProductMedia(productId, actor): Promise<AdminProductMediaView>`
- `ProductMediaService.ingestUpload({ productId, actorId, originalFilename, altText, bytes }): Promise<ProductMediaView>` stores the normalized candidate in private storage.
- `ProductMediaService.readPrivateContent(mediaId, actor): Promise<{ bytes: Buffer; mimeType: string }>` powers authenticated candidate previews; `AdminProductMediaView` returns a `previewUrl` pointing at that authenticated route for non-public media.

- [ ] **Step 1: Write failing HTTP/service tests** for draft creation, admin/inventory upload permission, customer denial, corrupt/oversize upload, cross-product access denial, and the Review Focus orphan-compensation case.
- [ ] **Step 2: Run the tests** and confirm missing routes/services.
- [ ] **Step 3: Implement `POST /api/v1/admin/catalog/products`** to create an unpublished draft with stable product ID/slug/category and no implicit publication.
- [ ] **Step 4: Add direct `multer`/`@types/multer` dependencies, then implement `GET /api/v1/admin/catalog/products/:productId/media`, authenticated `GET /api/v1/admin/catalog/media/:mediaId/content`, and multipart upload route** with `FileInterceptor`, 12 MiB request cap, server-side image decode, private storage write, `ready_for_review` row creation, and audit `media.uploaded`.
- [ ] **Step 5: Add compensation** so a database failure after storage put attempts object deletion and never reports success.
- [ ] **Step 6: Register modules after identity/database and update deterministic OpenAPI generation expectations.**
- [ ] **Step 7: Run new HTTP tests, API foundation/security tests, and API build.** Expected: PASS.
- [ ] **Step 8: Commit** `feat: add product draft and media upload authority`.

### Task 5: Review, Featured Image, Gallery, and Archive Transactions

**Files:**
- Modify: `apps/api/src/product-media/product-media.service.ts`
- Modify: `apps/api/src/product-media/product-media.controller.ts`
- Test: `apps/api/test/product-media-lifecycle.spec.ts`

**Interfaces:**
- `approve(mediaId, actorId): Promise<ProductMediaView>`
- `reject(mediaId, actorId): Promise<ProductMediaView>`
- `archive(mediaId, actorId, replacementFeaturedMediaId?): Promise<ProductMediaView>`
- `setFeatured(productId, mediaId | null, actorId): Promise<AdminProductMediaView>`
- `reorderGallery(productId, orderedMediaIds: string[], actorId): Promise<AdminProductMediaView>`
- `setBrandMode(productId, brandMode: "auto" | "unbranded" | "branded", actorId): Promise<AdminProductMediaView>`

- [ ] **Step 1: Write failing lifecycle tests** for approval permission, only-approved featured media, same-product ownership, one featured media, deduplicated contiguous gallery order, featured media appearing once, archive replacement/removal requirement, admin-only brand-mode override/audit, private-to-public promotion, and concurrent featured/archive conflict behavior.
- [ ] **Step 2: Run the tests** and confirm failure.
- [ ] **Step 3: Implement lifecycle transitions with Prisma transactions** and audit actions `media.approved`, `media.rejected`, `media.archived`, `media.featured.changed`, `media.gallery.reordered`, `product.brand_mode.overridden`. Approval reads the private normalized object, writes a new immutable public object, commits the approved row/new key, then deletes the old private object only after DB success; DB failure compensates by deleting the new public object.
- [ ] **Step 4: Expose approve/reject/archive/featured/reorder routes** under the spec paths plus `POST /admin/catalog/products/:productId/media/brand-mode`, with permission guards and safe 404/403 behavior. Brand-mode override is admin-only.
- [ ] **Step 5: Run lifecycle, permission, and public-catalogue regression tests.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: add product media review and publishing lifecycle`.

### Task 6: Prompt Truth Rules and Generation Providers

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/product-media/image-generation.provider.ts`
- Create: `apps/api/src/product-media/image-generation.errors.ts`
- Create: `apps/api/src/product-media/product-image-prompt.ts`
- Create: `apps/api/src/product-media/fake-image-generation.provider.ts`
- Create: `apps/api/src/product-media/openai-image-generation.provider.ts`
- Create: `apps/api/src/product-media/image-generation.registry.ts`
- Test: `apps/api/test/product-media-prompt.spec.ts`
- Test: `apps/api/test/product-media-provider.spec.ts`

**Interfaces:**
- `ImageGenerationProvider.generate(request): Promise<GeneratedImageCandidate[]>`
- `ImageGenerationProvider.edit(request): Promise<GeneratedImageCandidate[]>`
- `buildProductImagePrompt(input: ProductImagePromptInput): string`
- Typed provider error codes: `unavailable | rate_limited | invalid_request | safety_rejected | transient_failure`.

- [ ] **Step 1: Write failing prompt tests** asserting unbranded prompts forbid fabricated logos/claims and branded prompts require reference-image preservation without invented packaging text/barcodes/nutrition/certifications.
- [ ] **Step 2: Write failing provider tests** for deterministic fake bytes/metadata and normalized OpenAI error categories using an injected/stubbed client; no network calls.
- [ ] **Step 3: Run tests** and confirm failure.
- [ ] **Step 4: Add the OpenAI SDK and implement the provider-neutral interfaces/registry.** Default configured model is `gpt-image-2`; credentials never leave the API/worker process.
- [ ] **Step 5: Implement server-built prompt logic from trusted catalogue fields, resolved/overridden brand mode, selected background intent, and the 500-character bounded note.**
- [ ] **Step 6: Run prompt/provider tests and ensure CI has no external provider dependency.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: add product image generation providers`.

### Task 7: Generation Request API and Idempotency

**Files:**
- Create: `apps/api/src/product-media/generation-job.service.ts`
- Modify: `apps/api/src/product-media/product-media.controller.ts`
- Test: `apps/api/test/product-media-generation-request.spec.ts`

**Interfaces:**
- `queueGeneration(productId, actor, request, idempotencyKey): Promise<ImageGenerationJobView>`
- `getGeneration(jobId, actor): Promise<ImageGenerationJobView>`

- [ ] **Step 1: Write failing tests** for queued job creation, 1–4 candidate validation, inventory/admin permissions, exact idempotent replay, idempotency hash conflict, missing branded reference returning `REFERENCE_IMAGE_REQUIRED`, and reference media belonging to the same product.
- [ ] **Step 2: Run the tests** and confirm failure.
- [ ] **Step 3: Implement `POST /admin/catalog/products/:productId/media/generations`** using the existing `Idempotency` table with operation `product_media_generation`; the HTTP `Idempotency-Key` header is required.
- [ ] **Step 4: Implement `GET /admin/catalog/media/generations/:jobId`** with product ownership/permission checks and candidate IDs only after persistence.
- [ ] **Step 5: Emit `media.generation.requested` audit event and store the server-built prompt/request snapshot without provider secrets.**
- [ ] **Step 6: Run generation request tests plus existing idempotency/security tests.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: add idempotent media generation jobs`.

### Task 8: PostgreSQL Generation Worker and Retry Semantics

**Files:**
- Create: `apps/api/src/product-media/generation-worker.service.ts`
- Create: `apps/api/src/media-worker.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/test/product-media-worker.spec.ts`

**Interfaces:**
- `claimNextJob(): Promise<ClaimedGenerationJob | null>` uses `FOR UPDATE SKIP LOCKED` semantics.
- `processJob(jobId: string): Promise<void>` moves `queued -> generating -> succeeded|failed` and persists candidates only after validated storage writes.
- `runMediaWorker()` polls at configured interval until SIGTERM/SIGINT.

- [ ] **Step 1: Write failing worker tests** for two concurrent claims, successful fake-provider generation, up to three transient attempts, terminal safety rejection, storage failure consistency, DB failure compensation, and no duplicate candidate creation after restart/retry.
- [ ] **Step 2: Run tests** and confirm failure.
- [ ] **Step 3: Implement transactional claim and processing.** Increment attempt count before provider work; retry only typed transient/rate-limit/storage-transient cases up to three total attempts.
- [ ] **Step 4: Validate/store every provider candidate before creating `ready_for_review` media; mark job `succeeded` only when accepted candidates are durable.**
- [ ] **Step 5: Emit completed/failed audit events and structured logs containing IDs/error category/latency/bytes but no secrets/raw binaries.**
- [ ] **Step 6: Add `worker:media` script and graceful shutdown entry point.**
- [ ] **Step 7: Run worker tests and full API test suite.** Expected: PASS.
- [ ] **Step 8: Commit** `feat: add product media generation worker`.

### Task 9: Browser Service Boundary, Multipart Transport, and UAT Mock Parity

**Files:**
- Modify: `src/services/adapters/types.ts`
- Modify: `src/services/adapters/http.ts`
- Modify: `src/services/adapters/browser.ts`
- Modify: `src/services/client.ts`
- Modify: `src/services/operation-registry.ts`
- Modify: `src/services/mock/router.ts`
- Modify: `packages/contracts/src/endpoints.ts`
- Test: `scripts/http-adapter-regressions.test.ts`
- Create: `scripts/product-media-client-regressions.test.ts`

**Interfaces:**
- Extend `ServiceRequest` with optional `formData?: FormData`, mutually exclusive with JSON `body`.
- Add typed `apiOps.productDraftCreate`, `productMedia`, `productMediaGenerate`, `productMediaGeneration`, `productMediaApprove`, `productMediaReject`, `productMediaArchive`, `productMediaSetFeatured`, `productMediaReorder`, `productMediaBrandMode`, and `productMediaUpload`. Candidate images use the authenticated `previewUrl` returned by `AdminProductMediaView`, not a binary service-adapter operation.

- [ ] **Step 1: Write failing adapter tests** proving multipart requests do not set JSON `Content-Type`, path parameters still resolve, idempotency headers survive, JSON behavior is unchanged, and body/formData together is rejected.
- [ ] **Step 2: Write failing client-registry tests** for all new operations including brand-mode override and candidate preview URLs supplied by the media read response, plus cache invalidation tags (`catalogue`, `product-media`).
- [ ] **Step 3: Run tests** and confirm failure.
- [ ] **Step 4: Extend the transport with explicit multipart support** without bypassing `resolveClientAdapter()`; mock protocol accepts equivalent deterministic upload/generation fixtures for UAT visual testing.
- [ ] **Step 5: Add endpoint mappings and client methods.** Production upload maps to the multipart NestJS route; generation sends required idempotency key.
- [ ] **Step 6: Run adapter/client regressions and existing browser cache tests.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: expose product media client operations`.

### Task 10: Admin Add Product and Product Media AI Studio UI

**Files:**
- Create: `src/features/catalog/product-media-studio.tsx`
- Create: `src/features/catalog/product-media-upload.tsx`
- Create: `src/features/catalog/product-media-generation.tsx`
- Create: `src/features/catalog/product-media-gallery.tsx`
- Modify: `src/app/admin/products/page.tsx`
- Modify: `src/app/admin/products/[id]/page.tsx`
- Create: `scripts/product-media-ui-regressions.test.ts`

**Interfaces:**
- `ProductMediaStudio({ productId, canApprove, canPublish }: Props)` owns read/poll/review refresh state through `apiOps` only.
- Add Product creates an unpublished draft, then routes to `/admin/products/{id}`; it never publishes automatically.

- [ ] **Step 1: Write failing UI source/contract regressions** for Add Product, Product Media section before variants, featured card, gallery controls, upload picker, 4 style presets, background-intent choices, candidate count 1–4, brand-mode override, branded reference enforcement, generation status/history, approve/reject/set-featured/archive actions, and keyboard/mobile move-left/move-right controls.
- [ ] **Step 2: Run the UI test** and confirm failure.
- [ ] **Step 3: Implement Add Product draft dialog/form** using name/category/slug/short description and redirect after successful save.
- [ ] **Step 4: Implement Product Media Studio as focused components** using existing shadcn controls and the current green/amber admin visual language; poll only while jobs are queued/generating and stop on terminal state/unmount.
- [ ] **Step 5: Enforce branded-mode reference selection in the UI while retaining server enforcement as authority. Admins can set `auto/unbranded/branded`; inventory managers can see the resolved mode but cannot override it.** Show recoverable provider/storage/upload messages from `ApiError.code`.
- [ ] **Step 6: Run UI regressions, TypeScript, ESLint, and production Next.js build.** Expected: PASS.
- [ ] **Step 7: Browser-QA `/admin/products` and one product editor at desktop/mobile widths with fake provider fixtures.**
- [ ] **Step 8: Commit** `feat: add product media AI studio admin UI`.

### Task 11: Public Catalogue Approved Media and Storefront Gallery

**Files:**
- Modify: `apps/api/src/catalog/catalog.service.ts`
- Modify: `packages/contracts/src/catalog.ts`
- Modify: `packages/contracts/src/validation.ts`
- Modify: `src/features/catalog/product-tile.tsx`
- Modify: `src/app/(storefront)/products/[slug]/page.tsx`
- Modify: `src/lib/product-image-map.ts`
- Test: `apps/api/test/product-media-public-catalog.spec.ts`
- Modify: `scripts/storefront-rich-ui-regressions.test.ts`

**Interfaces:**
- `CatalogProduct.featuredImage?: CatalogMediaImage`
- `CatalogProduct.gallery: CatalogMediaImage[]`
- Compatibility `image` equals approved featured URL when present, else legacy `Product.image`, else existing safe UAT fallback at the frontend boundary.

- [ ] **Step 1: Write failing API tests** asserting approved media is returned in gallery order, featured appears once, draft/rejected/archived rows never leak, and legacy image remains when no approved media exists.
- [ ] **Step 2: Write failing storefront regressions** for product tile featured-image preference and product detail featured/gallery thumbnails.
- [ ] **Step 3: Run tests** and confirm failure.
- [ ] **Step 4: Update `CatalogService.map()`** to resolve approved media for products without exposing review metadata; keep the compatibility `image` value.
- [ ] **Step 5: Update product cards/detail gallery** to use approved media first. Keep `product-image-map.ts` only as the temporary last-resort UAT fallback until the coverage gate is met; do not remove it in this task.
- [ ] **Step 6: Run API catalogue tests, storefront regressions, typecheck, lint, and build.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: publish approved product media to storefront`.

### Task 12: UAT Deployment, Worker Service, Media Serving, and Final Verification

**Files:**
- Create: `deploy/systemd/varietygroceries-media-worker.service`
- Create: `deploy/nginx/varietygroceries-product-media.conf`
- Create: `apps/api/scripts/import-legacy-product-media.ts`
- Create: `apps/api/test/product-media-legacy-import.spec.ts`
- Create: `docs/PRODUCT_MEDIA_RUNBOOK.md`
- Modify: `apps/api/.env.example`
- Modify deployment documentation/evidence under `docs/qa/` as appropriate.

**Interfaces:**
- UAT filesystem root: `/home/lightworld/data/varietygroceries/product-media`, with `private/` and `public/` subtrees.
- UAT public base: `https://portal.varietygroceries.com/media/products/` through a read-only Nginx alias that points only at the `public/` subtree.
- Worker runs as `lightworld`, same API code release/config, separate systemd unit, restart-on-failure, graceful SIGTERM.

- [ ] **Step 1: Write failing legacy-import tests** proving owned/local legacy images import as `legacy_import` while external URLs are skipped and nothing is auto-approved without the explicit migration review policy. Add deployment smoke checks for stable media root ownership, Nginx serving only `public/`, API config bundle, worker service definition, and refusal to expose draft/review objects.
- [ ] **Step 2: Implement `import-legacy-product-media.ts`, then create Nginx/systemd templates and runbook.** Document OpenAI-disabled behavior, fake-provider UAT mode, S3 production cutover, key rotation, worker restart, orphan cleanup, and rollback.
- [ ] **Step 3: Deploy schema/API to UAT, create stable media root, configure filesystem adapter and fake provider first, enable Nginx media alias, then start worker.** Verify application restart/release switch does not delete media.
- [ ] **Step 4: Run a UAT end-to-end flow:** create unpublished product → upload genuine image → generate fake candidates → approve → set featured → reorder gallery → verify storefront sees approved media only → archive/replace featured.
- [ ] **Step 5: Enable OpenAI provider only after fake-provider UAT passes and a server-side key is configured; generate one unbranded test product and one branded edit with a genuine reference.** Do not use CI for this check.
- [ ] **Step 6: Run complete verification:** `bun test`, `bunx tsc --noEmit`, `bun run lint`, `bun run build`, API `npm test`, Prisma migration status, OpenAPI determinism, `git diff --check`, HTTP permission smoke tests, and browser QA desktop/mobile.
- [ ] **Step 7: Confirm acceptance criteria and media coverage dashboard/report.** Do not remove the temporary Unsplash fallback until every published product has approved media; that cleanup remains a later commit after the coverage gate and one full UAT cycle.
- [ ] **Step 8: Commit** `ops: deploy product media AI studio to UAT`.

## Final Branch Review

- [ ] Review the entire branch against the approved spec, especially the five Review Focus failure classes.
- [ ] Confirm no OpenAI/S3 credentials, generated binaries, or private draft-media URLs are committed.
- [ ] Confirm public API responses cannot return draft/rejected/archived media.
- [ ] Confirm checkout/inventory/order/fulfilment regression suites remain green.
- [ ] Open the final PR with verification evidence, migration/rollback notes, UAT screenshots, worker status, and exact deployment SHA.
