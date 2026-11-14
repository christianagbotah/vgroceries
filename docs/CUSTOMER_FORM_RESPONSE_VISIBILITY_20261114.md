# Variety Groceries — customer form response visibility

**Scope:** Original staging portal at https://portal.varietygroceries.com. Production https://varietygroceries.com remains Coming Soon.

## User-reported defect

After submitting the Call Me Back / Customer Support form, the page could appear to scroll to the footer, hiding the confirmation and request reference. This happens because the long request form is replaced by a much shorter receipt panel while the browser preserves/anchors the old viewport position.

## Fix

- Introduced `src/hooks/use-submission-feedback-focus.ts` to focus an asynchronously rendered submission result (or failure) and scroll its start into view after React commits the new UI. The target has `tabIndex={-1}`, an appropriate ARIA role/label, a focus outline for keyboard navigation and `scroll-mt-28` to clear the sticky header.
- Uses a `requestAnimationFrame` after commit, explicit `focus({preventScroll:true})`, then `scrollIntoView({block:'start'})`. Respects `prefers-reduced-motion` by avoiding smooth animation where requested. This reduces browser-scroll anchoring confusion and puts the actual response back in sight.
- `/support` Call Me Back / human response: confirmation panel (including reference number and next actions) or form error becomes visible and keyboard/screen-reader focused. The backend support request and its persisted audit trail remain unchanged.
- `/track`: manual order lookups focus the verified tracking result or error. Background polling every 30 seconds **does not** pull the page back to the result.
- `/assistant`: a submitted shopping question focuses the answer or failure; budget-basket requests focus the generated basket or input/API error. Old budget results are cleared on a new submission to avoid contradictory status.
- Account sign-in/up already present short inline errors near the submit action; profile updates use an existing toast response; checkout already scrolls to its first invalid field. No additional auto-scrolling was added to these flows to avoid an unnecessary navigation disruption.

## Verification plan

- TypeScript production build and targeted ESLint for all modified pages/hooks.
- Real 375px browser UI test: fill Callback form and submit with a browser-intercepted synthetic success response; assert the confirmation and reference are rendered, focused and within the viewport even after the long form collapses.
- Real desktop-width browser test: intercept a synthetic service error; assert the error response is visible/focused and the original form remains available to retry.
- Do **not** post synthetic requests to the real support inbox or alter real database records to test the focus interaction.
- Anonymous original staging `/support`, `/track` and `/assistant` remain accessible; privileged inventory API still requires a true session and production root remains Coming Soon.

## Completed staging acceptance — 14 November 2026

- Targeted ESLint: passed for the reusable hook and all three customer pages.
- Optimized Next.js build and TypeScript: passed; 61 static pages generated, with all staging routes preserved.
- Canonical original staging `/support`, `/help`, `/track`, `/assistant`, `/`, `/shop`: HTTP 200. Staging API readiness: 200; anonymous privileged inventory API: 401; both staging systemd services active. Production retains its Coming Soon title.
- Headless Chromium on the real HTTPS staging form, **375px mobile**: submitted a complete callback request through a browser-only simulated successful API response. The form was replaced by the confirmation with reference; the confirmation was focused and visibly positioned within the viewport. Passed.
- Headless Chromium on real HTTPS staging, **1280px desktop**: simulated a support API failure. The inline error was focused and visibly positioned; the existing form remained available to retry. Passed.
- Both outcomes used browser-intercepted synthetic responses. **No real callback case was created**, no real customer data or inventory mutated, and no staff/customer account privileges changed.
- Tracking and assistant use the same tested focus helper, but their individual visual results have so far been checked by code/lint/build rather than the dedicated Chromium focus assertions above.
