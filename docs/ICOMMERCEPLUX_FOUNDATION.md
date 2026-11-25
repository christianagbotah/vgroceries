# iCommercePlux — reusable commerce product

Variety Groceries is the first installation. Keep the existing repository and
live domain while separating product and merchant identity.

## First implementation
Public business identity is read from the existing BusinessProfile singleton.
Header, footer and mobile search consume the same server-resolved identity.
The approved Variety Groceries logo is retained for that exact business name;
other names use text until configurable logo media is implemented. This is
not complete rebranding: metadata, receipts, notification templates, payment
descriptions, legal content, category-specific layouts and media remain.

## Independent installations and template registry
Use one source and versioned runtime, one dedicated database per installation.
Each installation selects a category and a compatible published template.
FreshMarket 001 is the implemented grocery hero; other templates are not yet
available. A central developer registry must track assignment history,
version compatibility, reusable/exclusive assignments and installation IDs.
Changing a storefront template must not mutate stock, orders or accounting.

## Branch and warehouse authority
Reuse Location, UserLocation, StockPosition and LogisticsNode where suitable.
Define headquarters, branches/outlets and warehouse stock locations with
explicit membership and permissions enforced server-side. Review every read
and write path, particularly customer orders and POS, before claiming branch
isolation. The current commerce.locationId singleton cannot serve as the
authority for arbitrary branches. Branch identity and fulfillment locations
must be persisted on transactions, not accepted from a browser without
authorization. Head office sees consolidated views; branch staff see only
authorized records. Customer association must not leak other-branch details.

Stock transfers: request, approve, reserve, dispatch, in-transit, receive,
reconcile discrepancies and close. Maintain quantity and valuation ledger
integrity, immutable audit history and idempotent commands. No stock increase
at destination before receipt. Support direct branch procurement through
supplier purchase orders, branch-addressed receipts, invoice and accounting
reconciliation. These are design requirements, not yet implemented.
