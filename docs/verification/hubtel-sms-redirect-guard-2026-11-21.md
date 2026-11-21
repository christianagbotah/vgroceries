# Hubtel SMS transport redirect guard — 2026-11-21

Scope: draft PR #186, not a live deployment.

Before changes, GitHub PR #186 had two successful checks (`verify`, `verify-api`), and COD D2 PR #153 was merged. This increment hardens the non-dispatching SMS transport by prohibiting automatic HTTP redirects when sending Basic-authenticated provider requests. This is defense in depth: even if a provider endpoint redirects, the transport fails rather than following it. A provider HTTP 403 remains an authorization failure, not acceptance.

Verification: isolated TypeScript compilation passed; 5/5 targeted Node tests passed (configuration, explicit provider acknowledgment, ambiguous HTTP 200, redirect refusal, HTTP 403); `git diff --check` passed. Tests use mock fetch; no live provider request was made.

Not verified: actual Hubtel SMS endpoint/payload/response contract, persisted customer consent, dispatch integration, end-to-end delivery, finance/security acceptance, and production deployment. No payment/COD flags, credentials, databases, live services, or brand assets changed.
