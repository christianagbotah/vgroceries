# Customer message staging: consent fail-closed guard (2026-11-21)

## Risk addressed
The optional staging worker previously treated global SMS/email switches as sufficient to queue messages to contacts found on orders. Global enablement does not establish per-customer consent and could replay up to 200 historical events. The queue is not a sending service, but it should not contain unauthorized deliveries.

## Change
Added a pure delivery eligibility guard that requires explicit consent recorded no later than the event, respects revocation, and rejects invalid timestamps. Until persisted consent evidence and channel-specific legal/transactional policy are integrated, the staging worker exits with an error before opening a database connection when any external channel is enabled. Disabled channels remain no-op. No provider calls or runtime configuration changes.

## Release restrictions
Do not activate external messaging until consent evidence is sourced from a verified record, event eligibility and opt-outs are enforced, and replay/dispatch semantics are integration tested. This is a deliberately blocking safety increment, not a working SMS/email integration.
