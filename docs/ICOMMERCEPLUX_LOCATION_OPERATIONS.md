# iCommercePlux location operations and access

## Access is role AND location, never location OR role

Each installation has its own database and business profile. Existing Location
and UserLocation records are the stock-location authority; LogisticsNode is a
separate delivery/routing concept. Do not create a duplicate stock ledger.
Head office, branch, warehouse and combined outlet/warehouse are location types
to implement. A branch can contain several stock locations; do not assume that
a pickup node is automatically a branch or that a branch can see all stock.

Current slice: administrators can assign existing cashiers and inventory
managers to multiple active locations and reassign them. Old sessions are
revoked, audit events identify the target role, and existing role permissions
are not expanded. Cashier suspension/reactivation remains cashier-only.
Global administrators retain existing access. This is not a complete
branch-supervisor role or scoped accounting/customer/orders implementation.

Future scoped roles: branch supervisor, storekeeper, procurement officer,
salesperson, cashier, transfer approver, receiver, accountant and delivery
agent. Model explicit location grants and action-level permissions; allow
multiple grants, optionally effective-dated, and explicit audited company-wide
permission. Never infer full access from a job title or missing location.
A worker can change active location without changing identity; historical
transactions retain their original location, actor and valuation.

## Internal stock transfers — no supplier purchase

Any authorized active source location can transfer to a different authorized
active destination: branch-to-branch, warehouse-to-branch, branch-to-warehouse,
warehouse-to-warehouse, head office to/from another stock location.
Source and destination belong to the same installation. No supplier payable,
purchase invoice, revenue or sales tax is generated merely by moving stock.
Preserve lot, expiry, base unit, inventory cost and audit trail.

1. Destination staff requests stock OR authorized source staff initiates transfer.
2. Source and destination scopes are checked independently for each action.
   Approver can be scoped to the relevant locations or explicitly company-wide.
3. Approve full/partial quantities, reserve source available stock atomically.
4. Source picks and dispatches; reduce source physical quantity, release only
   the transfer reservation, record matching in-transit quantity and cost.
5. Destination independently records actual receipt, including partial receipt,
   short/over/damaged/expired quantities, with evidence. No over-receipt can
   silently create inventory. Accepted quantity is added to destination only
   after recorded receipt; discrepancies remain in reconciliation.
6. Resolve discrepancies with authorized adjustment/return, close only when
   every dispatched quantity is accounted for. Cancellation releases only
   undispatched reservations. After dispatch use documented return/reconciliation.
7. Immutable movement/event ledger, idempotency, deterministic stock locking,
   audit history, reconciliation reports and accounting location allocations.

## External purchases — supplier to any permitted location

1. Local purchase requisition or direct purchase, according to approval rights.
2. Supplier selection, quotation/terms, purchase order specifying receiving
   branch/warehouse, expected quantities, currency, tax and unit cost.
3. Receive actual goods at the stated location; match PO, GRN and supplier invoice.
4. Record stock by lot/expiry, acquisition value, supplier liabilities or cash
   payments and applicable tax. Handle partial receipts, backorders, discrepancies,
   supplier returns and credit notes separately.
5. Never use a generic stock receipt or a transfer to simulate a supplier purchase.
   Supplier purchases are distinct documents, numbering, state transitions,
   permissions, journal entries and reports.

## Acceptance gates before deployment

Test unauthorized location requests, arbitrary IDs, cross-branch reads/exports,
revocation, concurrent changes and every mutation path. Include multi-location
supervisors, temporary reassignments, separation of approval/receipt duties,
idempotent transfer/purchase retries, overselling, partial receipts, valuation
conservation, in-transit aging and supplier invoice reconciliation.
Do not label unimplemented workflows as available in the UI.
