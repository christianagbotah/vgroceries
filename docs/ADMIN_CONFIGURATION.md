# Admin configuration backend

All endpoints require an authenticated administrator; web mutations use the
existing origin and CSRF guard. Requests reject undeclared fields. Mutations
write their audit metadata in the same transaction. Updates require the
current revision to avoid silently overwriting another administrator.

| Method | Route under /api/v1 | Behavior |
|---|---|---|
| GET | /admin/settings/business | Stored business identity, contacts, address, registration, operating hours, receipt footer and revision; currency is read-only GHS |
| POST | /admin/settings/business/update | Save full business fields with current version |
| GET | /admin/delivery-providers | List manual provider records |
| POST | /admin/delivery-providers | Create manual provider (name, contactPhone, contactEmail, coverage, notes, active) |
| POST | /admin/delivery-providers/:id/update | Update full manual provider fields and version, including deactivate |
| GET | /admin/integrations/credentials | Safe credential draft metadata, configuration presence and vault readiness; never secret values |
| POST | /admin/integrations/credentials/:id/draft | Save full provider-specific credential candidate with expected version (0 for initial creation) |

Supported draft IDs: hubtel-checkout (clientId, clientSecret,
merchantAccountNumber), hubtel-sms (clientId, clientSecret, senderId),
paystack-payment (secretKey). Body: version and credentials object.
No arbitrary URL or activation flag is accepted. The separate deployment-managed
ADMIN_INTEGRATION_VAULT_KEY must be a 32-byte hexadecimal encryption key.
It is not provisioned by this change. AES-GCM uses record/revision-bound AAD.
GET and audit never contain ciphertext or submitted values. The currently
running payment and SMS adapters do not read draft credentials.

The additive migration seeds only the business name; it invents no contact
details. The delivery directory is manual only and does not yet route jobs.
No third-party courier API is claimed connected. Business profile consumption
in storefront/receipts, UI forms, provider connection verification, protected
credential activation/rotation and operational settings authority are
follow-up work. Existing payment/COD/financial flags remain unchanged.
Do not apply the migration or deploy before CI and owner acceptance.
The new routes follow the existing CMS pattern of manual API documentation
pending formal OpenAPI integration.

## Customer contact publication

The read-only public GET /content/business-contact route explicitly selects
only support phone, email, address, hours and receipt footer. Blank fields
remain hidden, and missing backend data does not invent contact details.
The storefront footer and Help page use this projection. Customer receipt
display, HTML and text downloads show current support information separately
from the historical order record. This is not a legal issuer snapshot or a tax
invoice. Existing order financial values, official logo, historical issuer
identity, and POS receipt records remain unchanged.

## Manual courier assignments

The administrator's /admin/dispatch/providers page reads the existing
production dispatch queue and active directory partners. Assignment and
reassignment use existing dispatch commands with header-only idempotency
keys. A reserved directory: provider key identifies a stored partner.
The server locks and validates that partner and snapshots its name rather
than trusting client display text. Inactive or missing directory partners
cannot be newly assigned. Already assigned jobs and historical snapshots
are preserved. The older ad-hoc manual booking contract remains supported.
Coverage is informational; staff arrange the external booking and verify
coverage before recording it. No courier API booking, delivery or payment
confirmation is implied. The legacy general dispatch screen still needs
full migration to the production queue contract.
