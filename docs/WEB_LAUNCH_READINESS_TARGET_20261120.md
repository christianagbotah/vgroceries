# Variety Groceries — conditional web launch target, 20–21 November 2026

Goal: limited Ghana **web** storefront rollout on Friday 20 November 2026 (Saturday 21 November contingency), only after the company explicitly approves and all release-critical gates pass. Production varietygroceries.com remains Coming Soon until approval.

## Confirmed platform status

Responsive web storefront and API run on canonical staging portal.varietygroceries.com. The repository has framework-independent API contracts and a React Native/Expo mobile readiness document, but **no actual Android APK/AAB, iOS IPA, TestFlight or app-store installable build**. Android and iOS require native projects, secure session storage, integrations, signing, EAS builds and device UAT; therefore do not announce a mobile download or make native releases mandatory for web launch.

## Go/no-go checklist

1. **Hubtel payments:** business supplies approved merchant credentials securely; engineers validate sandbox, live webhook signatures, duplicate callbacks, partial/refund cases, timeouts, settlement reconciliation and a controlled real-money test. Never expose keys in source.
2. **SMS/OTP:** business provides provider access; verify Ghana recipient delivery, consent, suppression, retries and OTP ownership. Phone-only password recovery remains incomplete until verified OTP exists.
3. **Email:** verify actual mailbox receipt, SPF/DKIM/bounces and email ownership before relying on self-service resets.
4. **Stock + checkout:** zero stock blocked, final unit protected against web/POS concurrency, FEFO, expired/quarantined exclusions, reservation release, cancel/refund boundaries and customer-friendly shortage messages.
5. **POS:** customer picker, branch/till RBAC, cash count and change, real receipt and shift reconciliation; cash-only staging simulation must not be confused with live card or MoMo verification.
6. **Operations:** picking, packing, dispatch, pickup/COD if offered, signed delivery proof, exception handling, customer updates and actual Ghana delivery zones/rates all validated.
7. **Security and recovery:** production credentials and flags, HTTPS, CSRF/session/RBAC/rate-limit checks, backups with tested restore, monitored logs, alerts, audit trails and a rehearsal for rollback.
8. **Full UAT and signoff:** desktop and phone browsers, real customer/staff roles, decline/refund/cancel/duplicate-event paths, real catalogue images/prices, contact support, terms, staff training and explicit owner approval.

Controlled cutover sequence: freeze scope, hide incomplete features, run full UAT, verify restore/rollback, obtain approval, release to limited service areas, monitor orders and settlements, then expand.

No unsupported percentage of readiness is claimed. Payment and operational trust outrank the date; remaining scope can be deferred only when not needed for the agreed launch.
