# Variety Groceries — Mobile Readiness (React Native + Expo)

**Status:** design prepared now; implementation is a later phase. The constraint that matters today: **mobile compatibility must be designed in**, and it already is — the API contract, the shared schemas and the operation semantics are framework-free and portable. This document specifies what the Android/iOS customer and rider apps will need so the backend team can build it right the first time.

Two apps on one Expo codebase, role-gated:

- **Customer app:** catalogue, cart, checkout, order tracking, returns, AI assistant.
- **Rider app (mobile-first today in web):** today's jobs, lifecycle actions, proof of delivery, COD collection, history.

---

## 1. Shared contracts and API clients

- `packages/contracts` (today `src/services/contracts/` + `src/types/domain.ts`) is pure TypeScript + zod — **no Next.js/React/Prisma imports** — and is consumed verbatim by the Expo apps.
- `packages/api-client` implements the same `ServiceAdapter` interface the web app uses (`src/services/adapters/types.ts`), with a React Native `fetch` transport, the same `Idempotency-Key` header, the same error normalisation (`ApiError(code, message, details)`), and the same zod request validation. Screens written against `apiOps` on the web translate to mobile with near-identical data code — the rider workspace (`/rider`) is deliberately styled mobile-first today so its interaction patterns carry over.
- Money/quantity conventions are identical (integer pesewas, decimal-string quantities), so no platform-specific math drifts.

## 2. Authentication, session renewal, revocation

- Sign-in: phone + password/PIN (customers), phone + PIN (riders). OTP via SMS as a step-up for high-value actions (optional).
- **Access token (JWT, ~15 min) + rotating refresh token.** The RN client stores tokens in the platform secure store (Keychain/Keystore — never AsyncStorage), refreshes proactively on app foreground and 401, and serialises refreshes with a mutex.
- **Revocation:** `sessions.revoked_at` on the backend; the client treats `UNAUTHENTICATED` by dropping state to the login screen, preserving locally drafted (clearly pending) work. Users can list and revoke device sessions; a revoked device gets 401 on next refresh.
- Device-bound session metadata (device id, platform, last seen) supports "sign out all devices" and support workflows.

## 3. Device registration and push notifications

- `POST /devices` registers `{ platform, pushToken, locale, appVersion }`; tokens refresh on Expo Push Token rotation; the backend sends transactional pushes (order confirmed, out for delivery, delivered, refund completed) **from the outbox** so notifications are exactly-once with the underlying event.
- Notification taps deep-link via the app's URL scheme (`vgroceries://orders/{id}`), which mirrors the web routes (`docs/ROUTES.md`) — same resource ids everywhere.
- Riders additionally subscribe to assignment pings; quiet hours and duty rota respect rider availability state (the `/riders/{id}/availability` operation already models it).

## 4. Camera, barcode scanning, delivery evidence

- **Barcode scanning** (customer + staff-future): the product/variant barcode field is already in the contract (`barcode` on variants, `q` search on `/pos/search`). Expo Camera/BarcodeScanner feeds the same search operation — no mobile-only lookup path.
- **Camera uploads:** delivery proof photos, return evidence photos. Upload flow: request a short-lived signed upload URL (`POST /media/upload-requests` — to be added), upload binary directly to object storage, submit the resulting `media_ref` with the business operation (rider deliver proof, return evidence note). Uploads are queued and retried like any mutation (§6), never inline-blocking the delivery action when offline.
- **Delivery evidence contract:** `proof { method: pin|signature|photo_note, detail, at }` — already returned by the web APIs; the rider app produces the same object. PIN proof = the order's verification code entered by the customer at handover (generated server-side per order).

## 5. Permission-based location reporting

- Foreground-only location while a delivery job is active; background location only with explicit OS permission, never silently. Reporting = `POST /rider/location { lat, lng, label?, at }` while on shift; the backend stores last-known + timestamp (`riders.last_location_at/lat/lng/label` — schema already reserves the columns).
- The rider can see exactly what was reported and when (the web admin rider list already surfaces `lastLocationAt/lastLocationLabel` — transparency by design). Permission denied is a normal state, not an error: dispatch continues with address + phone contact.

## 6. Pending uploads and safe retries

Every network mutation goes through an **outbox queue on device** (not to be confused with the server outbox):

1. Action performed offline → written to a local queue with status **Visibly pending** (badge + "waiting to sync" row; never presented as done).
2. Queue drains FIFO when connectivity returns; each request carries its original `Idempotency-Key`, so a retry after an interrupted response replays the server's original outcome instead of duplicating it — the exact semantics the mock engines already enforce (checkout, POS, refunds, rider actions).
3. Terminal failures (409/422) surface with the server's message and stay inspectable; the user decides to discard or keep the draft.
4. **Local data is always marked provisional:** drafts, cart, notes, pending evidence. The authoritative state — completed sales, payment results, stock reservations, delivery status — is only what the server confirmed; screens re-sync on foreground and render server state as the source of truth (the pending badge disappears only on acknowledged server response).

## 7. API compatibility with older installed versions

- `/api/v1` is additive-only within the version: new fields optional, existing fields never renamed or removed. The zod response schemas in `packages/contracts` are the compatibility gate — CI validates the live API against them on every release (the web contracts suite already does exactly this against the mock; the same suite runs against staging).
- Mobile releases lag web: keep deprecated fields for **at least two app release cycles**; then remove behind `/api/v2`. Contract tests fail the backend build on any breaking shape change.
- Minimum-version floor: the API advertises its version and the app warns (never bricks) when its floor is exceeded — the app keeps functioning read-only, mirroring the web's honest degraded states.

## 8. What the rider app reuses from today's web work

The rider workspace already demonstrates, over the shared API: job checklist, contact call link, proof dialog with method+detail, failure reporting with reason, pending notes, COD collection as a separate explicit step, remittance history, and auto-refresh of today's queue. The RN app is a re-skin of those same operations plus native camera/location/push — no new server operations are required beyond media upload requests and location reporting (both specified above).

## 9. Build/ops notes

- Expo EAS builds; OTA updates for JS-only changes (contracts bumps ride OTA within additive changes; native module changes require store releases).
- App version + device info reported on every session refresh (`X-App-Version` header) so the backend can monitor version mix and warn before removing deprecated fields.
- Crash + ANR reporting wired to the same observability stack as the API (see `BACKEND_ARCHITECTURE.md` §5).
