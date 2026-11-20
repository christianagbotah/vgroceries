# POS-integrated staging checkout readiness backport (20 November 2026)

## Why a separate lineage is needed

The canonical `https://portal.varietygroceries.com` serves a POS-integrated web/API pair on **3052/3049**. The API currently runs an immutable Hubtel-safe release derived from commit `5491557e6c308f3ef16dc06aec7f8cbd9915a06b`, a revision on the open hosted-checkout branch, and its `GET /api/v1/checkout/payment-availability` returns HTTP **404**. GitHub `main` has since implemented the endpoint in `086dbfc`, but replacing the canonical POS source with unrelated `main` would risk losing cashier and staging capabilities.

This source-only change backports **the read-only endpoint and customer checkout availability preflight** onto the same hosted-checkout source lineage (after `ec74f13`). No payments, orders, merchant configuration, database, Nginx or production deploy are modified.

## Behaviour

- `GET /api/v1/checkout/payment-availability` is anonymous, `Cache-Control: no-store`, and returns only `{ok:true,data:{electronicAvailable:boolean,mode:"production"}}`.
- Availability requires the existing server-authoritative configured payment adapter and compatible refund capability. Missing/invalid hosted refunds return `electronicAvailable:false` without exposing merchant keys or internal provider errors. **It does not certify actual paid settlement or production readiness.**
- Customer checkout starts in a checking state. If electronic checkout is unavailable or the network fails, electronic ordering is disabled **before** creating an order or payment attempt. A customer can choose only a permitted cash-at-counter/delivery option when genuinely available; otherwise the UI stays blocked with a useful message and a manual retry.
- The demo mock returns `mode:"demo"` to prevent mistaking a simulated route for actual merchant availability. Even if the public endpoint says ready, the backend independently checks payment/refund readiness during order/payment creation.
- API route contract, typed browser operation, OpenAPI metadata and a focused regression suite are included.
- The legacy branch's checked-in `docs/openapi-foundation.json` is already behind its own generated routes: a local source-only generation yielded 164 paths versus 149 in the existing snapshot, including 14 unrelated routes plus this new one. The generated file was **not** committed because unrelated API documentation parity requires a separate review; that drift remains a release gate.

## Deployment status and gates

**Not deployed.** This is intentionally a hotfix in the POS-integrated hosted-checkout branch lineage. Do **not** change the active 3052/3049 pair, apply fresh Prisma migrations to the original UAT database or replace the public Coming Soon website from this PR without the immutable release-parity checks and backup/restore proof. The active POS runtime may include additional unreleased UAT changes outside this GitHub branch.

Before staging cutover: pass clean Node 24 API+PostgreSQL and frontend CI on the exact commit; compare immutable route inventory against the active POS pair; test staff/cashier/customer roles, stock holds and real orders in an isolated database; rehearse rollback. Keep payment provider flags OFF until card/wallet refund coverage and Hubtel provider callback/status finance UAT are independently approved.

## Source checks

```bash
bun test scripts/pos-hosted-availability-backport.test.ts
```

An external `200 electronicAvailable:false` after a separate authorized staging rollout would prove that the *read-only route* is correctly deployed. It would not be a payment launch. Currently the live staging route still returns 404.
