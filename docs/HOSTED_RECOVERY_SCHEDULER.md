# Hosted payment recovery scheduler — controlled rollout

The compiled `dist/scripts/recover-hosted-payments.js` worker reconciles only eligible accepted, pending, unsettled Hubtel hosted attempts, at most ten per run. Existing durable claim and cooldown checks serialize provider lookups with customer refresh. This is not a payment initiation or refund mechanism. The timer is completion-relative (no overlapping runs of the same unit).

## Install in disabled state

Use the exact verified GitHub runtime release. Adapt the example unit paths to the canonical runtime, approved Node binary, and existing host-only environment files. Never put environment values, real payment references, or approval files in GitHub. Install the unit and timer but leave the timer disabled and stopped. Create the root-owned activation environment file with `HUBTEL_HOSTED_RECONCILIATION_WORKER_ENABLED=false` and mode 0600; do not create the approval marker. The final environment file must contain only the explicit activation flag so it cannot override payment credentials or connection settings. The worker itself defaults to off; systemd additionally skips the service if the approval marker is absent. A missing mandatory environment file also prevents execution.

Verify service user, runtime path, compiled worker, API compatibility, database migrations, provider status-lookup credentials and permissions, backup/rollback readiness and hardened unit configuration. Run `systemd-analyze verify` on the adapted unit and timer. Run the compiled worker with the flag explicitly false and confirm it exits without loading the provider or database. Validate queue selection, shared claims, crash cooldown, ambiguous outcomes and callback/customer-worker convergence in isolated tests. Do not run an enabled worker against live attempts as a smoke test.

## Approved activation

After explicit approval for the intended environment and successful isolated acceptance, set the dedicated flag true, create the root-owned approval marker, run a bounded supervised one-shot against an authorized test order and record only aggregate counts. Confirm provider-authoritative settlement, no duplicate charge, idempotent order/stock/payment side effects and expected notification behavior. Only then enable the timer. Review aggregate scanned/matched/deferred/exceptions/errors/skipped counts and service exit status. Exceptions/errors require review; never blindly retry provider initiation. The timer waits one minute after service termination and does not replay missed runs.

## Stop and rollback

Stop and disable the timer first. Let any active bounded run finish or follow the incident procedure. Remove the approval marker and set the dedicated flag false. Verify no scheduled run remains. Do not reverse an already verified settlement or delete durable claims. Keep existing customer refresh and callback protections unchanged. Runtime rollback follows the release procedure and must remain database-compatible.

This template does not authorize live provider calls, change a production flag, establish customer receipt, or prove an external callback was delivered.
