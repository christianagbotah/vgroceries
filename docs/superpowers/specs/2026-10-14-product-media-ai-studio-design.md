# Variety Groceries Product Media AI Studio — Design

Date: 2026-10-14  
Status: Approved design, awaiting implementation-plan approval  
Target repository: `christianagbotah/vgroceries`

## 1. Purpose

Build a production-backed Product Media AI Studio inside the Variety Groceries CMS so authorized staff can create, upload, review, approve, order, and publish product imagery without relying on sketch placeholders or third-party hotlinks.

The system must support:

- one approved featured image per product;
- an ordered approved gallery per product;
- AI generation of realistic grocery product imagery;
- AI-assisted enhancement/staging of genuine branded packshots;
- manual uploads;
- human approval before any generated image appears on the storefront;
- auditability, permissions, failure recovery, and provider replacement;
- migration away from temporary demo image URLs now used by the UAT storefront.

The feature is part of the catalogue authority, not a standalone image toy.

## 2. Current Repository State

The existing PostgreSQL `Product` model has one `image` string and no gallery or media provenance. The public NestJS catalogue reads that field. The Next.js admin product pages expose product details, publication, prices, stock, and mock-oriented catalogue editing operations, but the production NestJS API does not yet provide a complete admin catalogue/media authority.

The redesigned UAT storefront currently uses temporary photographic fallbacks to eliminate sketch SVG placeholders. Those URLs are transitional and must be replaced by approved Product Media records as products receive production media.

## 3. Scope

### In scope

1. PostgreSQL media and generation-job models.
2. Production NestJS admin media endpoints and services.
3. Provider-neutral image generation contract.
4. Initial OpenAI image provider adapter, configured only on the server.
5. Deterministic fake provider for tests and local development.
6. Object-storage abstraction with local UAT and S3-compatible production adapters.
7. Product Media AI Studio inside the existing admin product detail route.
8. A minimal Add Product entry that creates an unpublished product draft before media generation, because AI media requires a stable product ID.
9. Upload, generate, inspect, approve, reject, archive, feature, and reorder media.
10. Storefront catalogue responses containing featured image and approved gallery.
11. Backward-compatible migration from `Product.image`.
12. RBAC, audit events, idempotency, safe errors, observability, and tests.

### Out of scope

- automatic publication of AI output;
- generation of fake branded packaging or logos;
- video generation;
- bulk catalogue import redesign;
- DAM features unrelated to product media;
- automatic background removal for every upload unless requested by the product editor;
- changing pricing, inventory, purchasing, checkout, or fulfilment authority.

## 4. Architectural Principles

1. **PostgreSQL remains authoritative.** Media state, approval, ordering, featured selection, generation jobs, and provenance live in the database.
2. **Binary files do not live in PostgreSQL.** Approved and draft image bytes live in object storage behind a storage adapter.
3. **No provider hotlinks on the storefront.** Provider outputs are downloaded, validated, normalized, and stored under Variety-controlled storage before they become media candidates.
4. **AI output is never auto-published.** Generated files enter reviewable draft state.
5. **Provider credentials are server-only.** No browser receives an image-generation API key.
6. **Generation is asynchronous.** The API creates a job and a worker processes it; the browser polls job status.
7. **The implementation is provider-neutral.** The first production adapter is OpenAI, but catalogue/media code depends only on `ImageGenerationProvider`.
8. **Branded-product truthfulness is enforced.** AI may stage or enhance a genuine supplied packshot; it must not invent branded packaging.
9. **Existing product image behavior remains readable during migration.** New code prefers approved media, then falls back to the legacy image field until migration is complete.

## 5. Data Model

### 5.1 Product changes

Add to `Product`:

- `featuredMediaId String? @unique`
- relation to the selected `ProductMedia`
- media collection relation

Retain `image String` temporarily for backward compatibility. New admin media writes do not update the legacy field. Public reads use approved featured media first and legacy `image` only when no approved featured media exists.

### 5.2 ProductMedia

New `ProductMedia` model:

- `id` UUID primary key;
- `productId` relation;
- `source`: `upload | ai_generated | ai_edited | legacy_import`;
- `status`: `draft | ready_for_review | approved | rejected | archived`;
- `storageKey` unique object key;
- `publicUrl` persisted only when the storage adapter returns a stable public URL; otherwise derived by media delivery service;
- `mimeType` restricted to approved raster formats;
- `width`, `height`, `byteSize`;
- `sha256` for deduplication/integrity;
- `altText`;
- `galleryOrder` nullable integer; approved media may participate in the gallery whether or not it is also featured;
- `originalFilename` nullable;
- `generationJobId` nullable relation;
- `createdBy` actor ID;
- `approvedBy` nullable actor ID;
- `approvedAt`, `rejectedAt`, `archivedAt` nullable timestamps;
- `createdAt`, `updatedAt`.

Rules:

- only `approved` media may be storefront-visible;
- `Product.featuredMediaId` may reference only an approved media row belonging to the same product;
- gallery order applies only to approved non-archived media; the featured media may also have a gallery order, and public product detail renders it once at the front rather than duplicating it;
- archiving the featured image requires a replacement or explicit featured-image removal transaction;
- storage objects are deleted only after the database transition succeeds and no ProductMedia row references the key.

### 5.3 ImageGenerationJob

New `ImageGenerationJob` model:

- `id` UUID primary key;
- `productId` relation;
- `requestedBy` actor ID;
- `mode`: `unbranded_generation | branded_packshot_edit`;
- `stylePreset`: `clean_studio | fresh_market | lifestyle_kitchen | ghana_market`;
- `status`: `queued | generating | succeeded | failed | cancelled`;
- `provider` stable provider ID;
- `model` provider model ID;
- `prompt` final server-built prompt;
- `requestSnapshot` JSON containing safe generation inputs and dimensions;
- `referenceMediaId` nullable and required for `branded_packshot_edit`;
- `candidateCount` integer 1–4;
- `providerRequestId` nullable;
- `attemptCount`;
- `errorCode` nullable safe internal code;
- `errorMessage` nullable sanitized operator message;
- `startedAt`, `completedAt`, `createdAt`, `updatedAt`.

Provider secrets and raw sensitive provider responses are never stored.

## 6. Storage Architecture

Define `ProductMediaStorage`:

- `put(input): StoredMedia`;
- `delete(storageKey)`;
- `publicUrl(storageKey)`;
- `exists(storageKey)`.

Adapters:

### UAT/local adapter

`FilesystemProductMediaStorage` stores objects outside the application release directory in a stable media root. Nginx serves that directory read-only through a dedicated media path. Deploying a new application release must not delete media.

### Production adapter

`S3ProductMediaStorage` targets S3-compatible storage using environment configuration. Production launch requires this adapter to be configured. Object keys are immutable and content-addressed or UUID-based; replacing an image creates a new object rather than mutating an old one.

Allowed input limits:

- JPEG, PNG, WebP only at ingestion;
- maximum 12 MiB source file;
- maximum 6000 × 6000 source dimensions;
- image decoder must verify actual file type instead of trusting extension/MIME header;
- normalized derivatives use WebP/JPEG suitable for the storefront.

## 7. AI Provider Architecture

Define `ImageGenerationProvider`:

- stable `id`;
- `generate(request)` returning 1–4 binary candidates plus safe provider metadata;
- `edit(request)` for reference-image workflows;
- typed provider errors: unavailable, rate_limited, invalid_request, safety_rejected, transient_failure.

Initial adapters:

1. `OpenAIImageGenerationProvider` for production-capable AI generation. The model is configured through `AI_IMAGE_MODEL`; the initial deployment default is `gpt-image-2`. OpenAI credentials are provided only through server environment variables.
2. `FakeImageGenerationProvider` for tests, CI, and deterministic local behavior. It never calls an external service.

If the production provider is not configured, uploads and existing-media management continue to work; generation endpoints return a clear `AI_IMAGE_PROVIDER_UNAVAILABLE` response and do not create phantom successful jobs.

## 8. Prompt and Product-Truth System

The browser never sends a free-form final provider prompt. It sends structured choices. The server builds the final prompt from trusted product fields plus bounded staff inputs.

Prompt inputs:

- product name;
- category name;
- short description;
- product description;
- tags;
- selected style preset;
- desired background intent;
- optional operator note capped at a safe length;
- branded/unbranded mode.

### Unbranded groceries

Examples: tomatoes, onions, plantain, yam, eggs, fresh fish, rice in a generic bowl, unpackaged bakery goods.

The system may create a complete product photograph, but prompts require:

- realistic food/grocery photography;
- no fabricated logos;
- no text labels unless explicitly present in a supplied reference;
- no health, medicinal, nutritional, or certification claims;
- no quantity/size claims not supplied by catalogue data;
- visual presentation consistent with the named product.

### Branded packaged goods

Examples: named commercial beverages, cereals, canned foods, branded household products.

`branded_packshot_edit` requires a staff-uploaded genuine reference image. AI may:

- clean or improve the background;
- improve lighting and presentation;
- stage the genuine packshot in a grocery/lifestyle scene;
- preserve the product identity.

The system must reject branded-generation requests without a reference image. It must not ask a model to invent logos, packaging text, trademarks, barcodes, nutrition panels, or certification marks.

The admin may explicitly classify a product as unbranded or branded when the automatic heuristic is uncertain. That override is audit logged.

## 9. Generation Worker

Use a PostgreSQL-backed job queue for this subsystem instead of adding Redis solely for image generation.

Worker behavior:

1. claim one queued job transactionally using row locking/skip-locked semantics;
2. transition it to `generating` and increment attempt count;
3. load trusted product data and reference media if required;
4. build the server prompt;
5. call the provider adapter;
6. validate each returned binary;
7. persist each binary through `ProductMediaStorage`;
8. create `ProductMedia` candidates in `ready_for_review` state;
9. mark job `succeeded` only after all database/media writes for accepted candidates complete;
10. on transient provider/storage errors, retry up to three total attempts with backoff;
11. on terminal errors, mark `failed` with a sanitized reason.

A separate systemd service runs the worker. Application restarts do not lose queued jobs.

## 10. Admin API

All endpoints are under authenticated admin catalogue authority.

### Product draft

- `POST /api/v1/admin/catalog/products`
  - creates an unpublished product draft with required name/category/slug fields;
  - returns the product ID and editor route.

### Media reads

- `GET /api/v1/admin/catalog/products/:productId/media`
  - returns featured media, approved gallery, review candidates, and recent generation jobs.

### Upload

- `POST /api/v1/admin/catalog/products/:productId/media/uploads`
  - multipart upload;
  - validates and stores file;
  - creates `ready_for_review` media.

### Generate

- `POST /api/v1/admin/catalog/products/:productId/media/generations`
  - idempotency key required;
  - accepts mode, style preset, candidate count, optional reference media, optional bounded note;
  - returns queued job.

- `GET /api/v1/admin/catalog/media/generations/:jobId`
  - returns job status and candidate media IDs when complete.

### Review and publishing actions

- `POST /api/v1/admin/catalog/media/:mediaId/approve`
- `POST /api/v1/admin/catalog/media/:mediaId/reject`
- `POST /api/v1/admin/catalog/media/:mediaId/archive`
- `POST /api/v1/admin/catalog/products/:productId/media/featured`
- `POST /api/v1/admin/catalog/products/:productId/media/reorder`

All mutation routes validate ownership/product association server-side and emit audit events.

## 11. Permissions and Audit

Extend production access control with explicit catalogue permissions.

Role policy:

- `admin`: create draft products, upload, generate, approve/reject, set featured image, reorder gallery, archive media;
- `inventory_manager`: upload, generate, and manage draft/review candidates, but cannot approve storefront media or change featured media;
- `customer` and `rider`: denied.

New logical permissions:

- `catalog.media.read`;
- `catalog.media.generate`;
- `catalog.media.upload`;
- `catalog.media.approve`;
- `catalog.media.publish`.

Audit actions include:

- media.uploaded;
- media.generation.requested;
- media.generation.completed;
- media.generation.failed;
- media.approved;
- media.rejected;
- media.archived;
- media.featured.changed;
- media.gallery.reordered;
- product.brand_mode.overridden.

Audit details contain IDs, safe metadata, before/after featured IDs, provider/model IDs, and actor IDs, but never API keys or raw binary content.

## 12. Admin UI — Product Media AI Studio

The existing `/admin/products/[id]` page gains a clearly separated **Product Media** section near the product summary, before variants/stock operations.

Layout:

1. **Featured image card**
   - current approved featured image;
   - replace/remove controls according to permission;
   - storefront preview link.

2. **Gallery strip/grid**
   - approved gallery thumbnails;
   - drag/reorder on desktop, move-left/move-right controls for accessible keyboard/mobile use;
   - archive action.

3. **AI Media Studio panel**
   - mode selection;
   - style preset cards;
   - candidate count 1–4;
   - optional bounded creative note;
   - branded mode requires selection of a genuine uploaded reference image;
   - Generate button creates a job and displays queued/generating state;
   - completed candidates appear as review cards.

4. **Upload panel**
   - drag/drop and file picker;
   - preview before submission;
   - clear validation messages.

5. **Review candidate cards**
   - full image preview;
   - source badge (`AI generated`, `AI edited`, `Uploaded`);
   - provider/model for AI candidates;
   - approve/reject actions;
   - approved images may be set Featured or included in Gallery.

6. **Generation history**
   - recent jobs, status, requester, timestamps, failure reason, retry affordance when appropriate.

The products table uses the approved featured image if present, otherwise legacy/fallback imagery.

### Add Product integration

`/admin/products` gains **Add product** for users with catalogue edit authority. The first save creates an unpublished draft and redirects to `/admin/products/[id]`, where the Media Studio becomes available. Product publication remains a separate explicit action and must not be triggered by media approval.

## 13. Storefront Contract Changes

Extend catalogue product responses with:

- `featuredImage` object containing URL, alt text, width, height;
- `gallery` ordered array of approved media objects;
- temporary `image` compatibility string equal to featured URL when present, otherwise legacy fallback.

Storefront behavior:

- product tiles use `featuredImage` first;
- product detail renders the featured image plus approved gallery thumbnails;
- no draft/rejected/archived media is returned by public APIs;
- if no approved media exists, legacy image or current safe fallback remains visible;
- once all seeded products pass the approved-media coverage gate, the temporary Unsplash mapping is removed in a separate cleanup commit.

## 14. Error Handling

Operator-facing errors are specific and recoverable:

- unsupported/corrupt upload → reject before storage publication;
- oversized image → 413-style validation problem;
- provider unavailable → job not falsely marked successful;
- provider safety rejection → terminal failed job with safe explanation;
- provider rate limit/transient error → bounded retry then failed job;
- storage failure → no approved DB row referencing a missing object;
- DB failure after object upload → compensation deletes orphaned object when safe;
- attempt to approve media for another product → forbidden/not found without data leakage;
- attempt to use unapproved media as featured → validation failure;
- attempt to generate branded product without reference → `REFERENCE_IMAGE_REQUIRED`.

Every error response includes the existing request ID mechanism.

## 15. Security and Privacy

- API keys exist only in environment configuration available to the API/worker.
- Upload file names are treated as display metadata, never trusted paths.
- Object keys are server generated.
- Image decoders validate content and dimensions.
- SVG uploads are not accepted for product media.
- Public media URLs expose only approved objects.
- Draft/review objects are served through authenticated admin routes or short-lived signed URLs depending on storage adapter.
- Generation prompts do not include customer data, order data, staff secrets, or arbitrary database content.
- Request notes are length-limited and treated as untrusted text.

## 16. Configuration

Add configuration bundle:

- `PRODUCT_MEDIA_STORAGE=filesystem|s3`;
- filesystem media root and public base URL for UAT;
- S3 endpoint/region/bucket/access credentials for production;
- `AI_IMAGE_PROVIDER=openai|fake`;
- `AI_IMAGE_MODEL=gpt-image-2` initially;
- `OPENAI_API_KEY` for the OpenAI adapter;
- generation timeout, maximum candidates, and worker poll interval with validated defaults.

Production startup may run without AI provider configuration, but generation is disabled explicitly. Production launch with real product media must use S3-compatible storage rather than release-local filesystem storage.

## 17. Migration Strategy

1. Add new tables/fields without deleting `Product.image`.
2. Deploy API capable of dual-read fallback.
3. Import existing non-empty `Product.image` values as `legacy_import` media only when the image is an owned/local asset. External demo URLs remain fallback strings and are not silently copied into approved production media.
4. Deploy admin Media Studio.
5. Generate/upload and approve real media product by product.
6. Storefront automatically begins using approved media as it appears.
7. After every published product passes the approved-media coverage gate, remove the temporary photographic fallback map. Remove the legacy `Product.image` field only in a subsequent schema-cleanup release after one full UAT cycle confirms no fallback reads.

No migration step may convert an unreviewed AI output directly to approved media.

## 18. Testing Strategy

### Unit tests

- prompt builder for branded/unbranded modes;
- permission decisions;
- image validation;
- storage key generation;
- gallery ordering;
- featured-image invariants;
- provider error mapping;
- retry policy.

### Database/service tests

- migration applies cleanly to empty PostgreSQL and current schema;
- product/media ownership constraints;
- approving and featuring media is transactional;
- archived/rejected media cannot leak to public catalogue;
- idempotent generation request does not create duplicate jobs;
- worker claim is safe with concurrent workers;
- failed storage/provider operations leave consistent records.

### HTTP/security tests

- admin/media endpoints require authentication;
- role boundaries match the policy above;
- invalid multipart/image payloads are rejected;
- public catalogue never exposes draft media;
- OpenAPI output remains deterministic.

### Frontend tests

- Product Media section renders states correctly;
- upload validation and progress;
- generate/poll/review workflow;
- branded mode enforces reference selection;
- approve/set-featured/reorder flows;
- mobile layout and keyboard-accessible reorder actions;
- product detail gallery uses approved media.

### Provider tests

CI uses only `FakeImageGenerationProvider`. No external image-generation API is called from CI.

## 19. Observability

Record structured logs/metrics for:

- jobs queued/succeeded/failed;
- provider latency;
- provider error category;
- bytes stored;
- candidate count;
- review approval/rejection rates;
- worker claim/retry counts.

Do not log prompts containing untrusted operator notes at high-volume production log level; store the approved job prompt in the database where access is controlled.

## 20. Acceptance Criteria

The subsystem is acceptable when all of the following are true:

1. An admin can create an unpublished product draft and open its media editor.
2. Admin/inventory staff can upload genuine product images and request AI candidates according to their permissions.
3. Unbranded grocery generation can produce reviewable candidates.
4. Branded AI editing cannot start without a genuine reference image.
5. Generated images are copied into Variety-controlled storage before review.
6. No AI candidate appears publicly before admin approval.
7. An admin can approve media, choose exactly one featured image, and order a gallery.
8. The public catalogue returns only approved media and preserves a safe fallback for products not yet migrated.
9. Product cards and product detail pages use approved featured/gallery media when available.
10. Provider outage, rate limiting, storage failure, and bad uploads produce explicit recoverable states without corrupting media authority.
11. Every sensitive media action is permission-gated and audit logged.
12. CI uses deterministic fake generation and has no dependency on external provider availability.
13. UAT can run on stable filesystem media storage; production launch requires S3-compatible storage configuration.
14. The existing checkout/inventory/order behavior is unchanged by the media subsystem.

## 21. Implementation Boundary

This design is intended to be implemented as one coordinated subsystem plan with four ordered slices:

1. data contracts, schema, permissions, storage interfaces;
2. generation provider/worker and admin media API;
3. Product Media AI Studio UI and product-draft entry;
4. storefront media contract migration, deployment, and removal of demo-only dependencies once approved media coverage is sufficient.

Each slice must remain deployable behind safe fallbacks; no slice may require the public storefront to expose unapproved media.
