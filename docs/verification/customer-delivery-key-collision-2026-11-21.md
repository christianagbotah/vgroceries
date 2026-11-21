# Customer notification delivery key collision guard — 2026-11-21

Preflight: PR #186 checks `verify` and `verify-api` both passed at the preceding head `32be452`. COD D2 PR #153 was merged on 2026-11-19. Other open draft PRs remain unmerged.

The existing event:channel:recipient idempotency key format can collide if an untrusted event or recipient identifier contains the `:` separator. Reject empty, whitespace-padded, control-character and colon-containing identifiers instead of changing the persisted key format. Existing well-formed keys are unchanged. This is an isolated pure-function change; it does not enable notifications or payment processing.

Verification: `npm --prefix apps/api run build` succeeded; `node --test apps/api/dist/test/customer-channel-policy.spec.js` passed 4/4 tests; `git diff --check` passed. GitHub exact-head CI remains to be confirmed after push. No live/shared UAT deployment, service restart, branding change, provider credential modification, shared database migration or financial action was performed.

Blockers: persisted channel-specific consent and dispatch-time opt-out integration, end-to-end notification tests, Hubtel HTTP 403 reconciliation authorization where applicable, and independent security/finance acceptance.
