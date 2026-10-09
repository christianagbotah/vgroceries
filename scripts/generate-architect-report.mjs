/**
 * Variety Groceries — Delivery & Integration Report generator.
 * Run: node scripts/generate-architect-report.mjs
 * Output: download/Variety-Groceries-Delivery-and-Integration-Report.docx
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableLayoutType, SectionType, TableOfContents, LevelFormat,
} from "docx";
import fs from "node:fs";
import { P, allNoBorders, FONT, FONT_H, MONO, safeText, buildCoverR1 } from "./report-lib.mjs";

/* ============ generic builders ============ */
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: P.primary, font: FONT_H })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: P.primary, font: FONT_H })],
  });
}
/** body paragraph; segs: string or [{t, b, mono, i}] */
function body(segs, opts = {}) {
  const arr = typeof segs === "string" ? [{ t: segs }] : segs;
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 120, line: 312 },
    children: arr.map(s => new TextRun({
      text: s.t, bold: !!s.b, italics: !!s.i, size: 24, color: s.mono ? P.code : "000000",
      font: s.mono ? MONO : FONT,
    })),
  });
}
function bullet(segs) {
  const arr = typeof segs === "string" ? [{ t: segs }] : segs;
  return new Paragraph({
    bullet: { level: 0 },
    alignment: AlignmentType.LEFT,
    spacing: { after: 80, line: 312 },
    children: arr.map(s => new TextRun({
      text: s.t, bold: !!s.b, size: 24, color: s.mono ? P.code : "000000", font: s.mono ? MONO : FONT,
    })),
  });
}
function numbered(segs, ref) {
  const arr = typeof segs === "string" ? [{ t: segs }] : segs;
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.LEFT,
    spacing: { after: 80, line: 312 },
    children: arr.map(s => new TextRun({
      text: s.t, bold: !!s.b, size: 24, color: s.mono ? P.code : "000000", font: s.mono ? MONO : FONT,
    })),
  });
}
function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 200, line: 312 },
    children: [new TextRun({ text, size: 21, color: P.secondary, italics: true, font: FONT })],
  });
}
function tableTitle(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 200, after: 80, line: 312 },
    children: [new TextRun({ text, bold: true, size: 21, color: P.primary, font: FONT_H })],
  });
}

const cellMargins = { top: 60, bottom: 60, left: 120, right: 120 };
const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
  insideVertical: { style: BorderStyle.NONE },
};

/** dataTable: rows of cells; cell = string | {t, mono, b} | array of segs */
function dataTable(headers, rows, widths) {
  const mkCell = (cell, isHeader, w, ri) => {
    const segs = typeof cell === "string" ? [{ t: cell }] : Array.isArray(cell) ? cell : [cell];
    return new TableCell({
      width: { size: w, type: WidthType.PERCENTAGE },
      margins: cellMargins,
      shading: isHeader
        ? { type: ShadingType.CLEAR, fill: P.table.headerBg }
        : (ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: P.table.surface } : undefined),
      children: [new Paragraph({
        spacing: { line: 312 },
        children: segs.map(s => new TextRun({
          text: safeText(s.t, "-"), bold: isHeader || !!s.b, size: 20,
          color: isHeader ? P.table.headerText : (s.mono ? P.code : "000000"),
          font: s.mono ? MONO : FONT,
        })),
      })],
    });
  };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map((h, i) => mkCell(h, true, widths[i], 0)),
      }),
      ...rows.map((r, ri) => new TableRow({
        cantSplit: true,
        children: r.map((c, i) => mkCell(c, false, widths[i], ri)),
      })),
    ],
  });
}

/* ============ figure ============ */
const IMG_PATH = "docs/diagrams/architecture.png";
const imgBuffer = fs.readFileSync(IMG_PATH);
const IMG_W = 580, IMG_H = Math.round(580 * 830 / 1600);

/* ============ cover ============ */
const cover = buildCoverR1({
  title: "Variety Groceries",
  subtitle: "Delivery & Integration Report - Frontend Prototype Handoff",
  englishLabel: "ENGINEERING HANDOFF",
  metaLines: [
    "Prepared for: Solution Architect",
    "Prepared by: Prototype Build Team",
    "Date: 9 October 2026",
    "Repository: github.com/christianagbotah/vgroceries",
    "Version: 1.0",
  ],
  footerLeft: "Variety Groceries prototype",
  footerRight: "For integration planning",
  palette: P,
});

/* ============ headers/footers ============ */
function pageHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Variety Groceries - Delivery & Integration Report", size: 18, color: "808080", font: FONT })],
    })],
  });
}
function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: FONT })],
    })],
  });
}

/* ============ TOC section children ============ */
const tocChildren = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: FONT_H, color: P.primary })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field\".",
      italics: true, size: 18, color: "888888", font: FONT,
    })],
  }),
  // NOTE: no trailing PageBreak here - the body section break (NEXT_PAGE) already
  // starts a new page; a PageBreak would create a blank page (postcheck rule 1).
];

/* ============ BODY CONTENT ============ */
const bodyChildren = [];

/* ---- 1. Executive summary ---- */
bodyChildren.push(h1("1. Executive Summary"));
bodyChildren.push(body([
  { t: "This report documents the delivery of the Variety Groceries frontend prototype and maps out how the production backend replaces the development mock. The prototype implements the complete customer-facing storefront, the staff back office, the dispatch workspace and the rider application as a single Next.js 16 application. All four interfaces communicate with one versioned mock API consisting of " },
  { t: "91 operations", b: true },
  { t: ", so that every page exercises the same operation contracts the future backend must implement. The business logic behind those operations is not stubbed: reservations, stock depletion, payments, returns and refunds run as real, rules-complete engines over an in-memory seeded store." },
]));
bodyChildren.push(body([
  { t: "The delivery is complete and verified. All 48 application routes return HTTP 200, the 26 back-office routes were re-verified on 9 October 2026, the scripted acceptance suite passes 21 of 21 business-rule checks, and ESLint reports no issues. The source is published on GitHub under " },
  { t: "main", mono: true },
  { t: " with a clean commit history, and the documentation set (API contracts, permissions, demo scenarios, known issues) ships inside the repository. The key figures are summarised below." },
]));
bodyChildren.push(tableTitle("Table 1: Delivery at a glance"));
bodyChildren.push(dataTable(
  ["Dimension", "Result"],
  [
    ["Application routes verified (HTTP 200)", "48 at build; 26 admin routes re-verified 9 Oct 2026"],
    ["Interfaces delivered", "Customer storefront, staff back office, rider workspace (role-gated shell)"],
    ["Mock API operations (versioned boundary)", [{ t: "91", b: true }, { t: " across 9 namespaces (src/services/mock/router.ts)" }]],
    ["Business-rule engine modules", "8 (availability, orders, inventory, POS, delivery, returns, AI, reports)"],
    ["Acceptance checks", "21 / 21 passing (scripts/acceptance-checks.sh)"],
    ["Lint status", "ESLint clean (0 errors, 0 warnings)"],
    ["Seed catalogue / scenario orders", "52 products, 10 categories / 14 orders covering every required case"],
    ["Roles / permissions modelled", "8 roles with a 35-permission matrix"],
    ["Source size / repository files", "150 files under src/ / 246 tracked files on GitHub"],
    ["Documented known limits", "20 items, each with an honest boundary statement"],
  ],
  [45, 55],
));
bodyChildren.push(body([
  { t: "The purpose of this document is to hand the prototype to the architecture team with a precise integration map: where the mock service is attached, what contracts the real backend must satisfy, in which order to connect capabilities, and which seeded scenarios give the fastest confidence that a connected capability behaves correctly. Section 4 is the core of that map; the sections around it supply the scope, architecture, encoded business rules and verification evidence needed to read that map with full context." },
]));

/* ---- 2. Delivery scope ---- */
bodyChildren.push(h1("2. Delivery Scope - Four Interfaces"));
bodyChildren.push(body([
  { t: "The application is organised as one Next.js project with route groups per audience. The storefront is server-rendered for catalogue pages (shop, category, product) with client islands for cart, checkout and account interactions; the back office and rider workspace are client applications behind role gates. A demo role switcher in the staff shell lets reviewers inspect every role view without a real authentication system; it is clearly labelled as demo tooling and is intended for removal in production builds. The table below groups the delivered routes by interface." },
]));
bodyChildren.push(tableTitle("Table 2: Route inventory by interface"));
bodyChildren.push(dataTable(
  ["Interface", "Route groups", "Notes"],
  [
    ["Customer storefront (22 routes)", "home; shop with search/filter/sort/pagination; category; product with variant panel; cart; guided checkout; payment status; order tracking; account (orders, addresses, lists, returns); 5 policy/help pages", "Ghana-localised: +233 phone validation, GhanaPostGPS field, GHS currency, delivery zones and slots with cutoffs"],
    ["Staff back office (26 routes)", "dashboard; orders list + detail with substitution and review resolution; fulfilment queues (FEFO lots); POS with holds and receipts; cashier sessions; inventory (overview, receiving, adjustments, stocktakes, expiry); products + detail; categories; suppliers; purchase orders; dispatch; riders; providers; returns + detail; refunds; payments; customers; reports (CSV export); AI; team permission matrix; audit; settings", "All actions permission-gated and audit-logged; price changes carry reason + approval"],
    ["Rider workspace (4 routes)", "demo login; today (auto-refresh); job detail with checklist, contact, proof dialog and fail reporting; history", "Mobile-first layout; job mutations are idempotent against double-submits"],
    ["Shared services (1 route)", [{ t: "/api/mock/v1/[...path]", mono: true }, { t: " catch-all" }], "The single HTTP boundary every page talks through"],
  ],
  [22, 48, 30],
));
bodyChildren.push(body([
  { t: "Scope discipline was maintained throughout: no real payments are initiated, no courier is booked, no external AI is called, and no real authentication exists. Every such boundary is labelled honestly in the interface (for example, delivery providers render as " },
  { t: "not connected", mono: true },
  { t: "), and the demo controls that simulate latency, offline mode and payment failure live behind the staff-only demo section. This keeps the prototype safe to demonstrate while making the integration surface explicit rather than implied." },
]));

/* ---- 3. System architecture ---- */
bodyChildren.push(h1("3. System Architecture"));
bodyChildren.push(body([
  { t: "The architecture keeps one hard rule: every page reaches data through the typed client " },
  { t: "src/services/client.ts", mono: true },
  { t: ", which calls operations on the catch-all route " },
  { t: "/api/mock/v1/<operation>", mono: true },
  { t: ". The route handler dispatches to the mock router (" },
  { t: "src/services/mock/router.ts", mono: true },
  { t: "), which delegates to eight engine modules operating on a single in-memory seeded store. Figure 1 shows the layering and the swap point where the production backend attaches." },
]));
bodyChildren.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 120, after: 40 },
  children: [new ImageRun({ data: imgBuffer, transformation: { width: IMG_W, height: IMG_H }, type: "png" })],
}));
bodyChildren.push(caption("Figure 1: Prototype architecture and integration boundary (swap point highlighted)"));
bodyChildren.push(body([
  { t: "The engine layer is where the business rules live, and it is deliberately written as if it were a backend: each engine takes the store as its first argument, raises typed operation errors, and mutates state transactionally within a single process. The engines were verified against 21 scripted acceptance checks plus browser-driven golden-path tests. The table below lists each engine and the invariant it protects." },
]));
bodyChildren.push(tableTitle("Table 3: Engine modules and their critical invariants"));
bodyChildren.push(dataTable(
  ["Module", "Responsibility", "Critical invariant enforced"],
  [
    [[{ t: "availability.ts", mono: true }], "Available-to-sell computation for every variant; expiry sweeps", [{ t: "availableToSell = sellable lots - active reservations - safety stock", mono: true }]],
    [[{ t: "orders.ts", mono: true }], "Reservations, checkout, payment callbacks, status transitions, substitutions, review resolution", "Atomic multi-line holds; single depletion event per order; late payment after expiry goes to staff review, never double-consumes"],
    [[{ t: "inventory.ts", mono: true }], "FEFO lot consumption, receiving with PO matching, adjustments, stocktakes, quarantine/disposal", "Damaged or quarantined lots never enter available-to-sell; adjustments require reason and approval"],
    [[{ t: "pos.ts", mono: true }], "POS sales, holds with expiry, receipts, cashier sessions", "Completion is idempotent (idempotency key); session close records expected vs counted difference"],
    [[{ t: "delivery.ts", mono: true }], "Rider assignment, job lifecycle, proof of delivery, failed delivery, return-to-store", "COD is three separate recorded events: delivery, cash collection, remittance"],
    [[{ t: "returns.ts", mono: true }], "Return eligibility, dispositions, refunds with retry", "Refunds cannot exceed the eligible original balance; damaged disposition never restocks"],
    [[{ t: "ai.ts", mono: true }], "Assistant, basket suggestions, business questions (deterministic)", "Suggestions carry evidence and are review-before-execute; nothing applies automatically"],
    [[{ t: "reports.ts", mono: true }], "Reconciling aggregations for dashboard and reports", "Every figure recomputed from ledger state, never cached approximations"],
  ],
  [18, 42, 40],
));

/* ---- 4. Integration map ---- */
bodyChildren.push(h1("4. The Integration Map - Swapping in the Real Backend"));
bodyChildren.push(h2("4.1 The single swap point"));
bodyChildren.push(body([
  { t: "Every page depends on exactly one module for data access: " },
  { t: "src/services/client.ts", mono: true },
  { t: ". The client exposes typed operations (for example " },
  { t: "catalog.list", mono: true },
  { t: ", " },
  { t: "checkout.quote", mono: true },
  { t: ", " },
  { t: "admin.order.action", mono: true },
  { t: ") and a transport function " },
  { t: "api()", mono: true },
  { t: ". Integration therefore means replacing that transport with real HTTP calls to a backend that implements the same operation names, envelopes and error codes; no page changes are required. Once the real API is live, " },
  { t: "src/services/mock/", mono: true },
  { t: " and " },
  { t: "src/app/api/mock/", mono: true },
  { t: " are deleted, and the " },
  { t: "demo.*", mono: true },
  { t: " operations plus the demo role selector are removed from production builds. The contracts are proposed application contracts, not claims about any third-party endpoint." },
]));
bodyChildren.push(h2("4.2 Wire conventions and error codes"));
bodyChildren.push(body([
  { t: "The transport conventions are deliberately strict so they survive the swap. Every response uses the envelope " },
  { t: "{ ok: true, data }", mono: true },
  { t: " or " },
  { t: "{ ok: false, error: { code, message, details } }", mono: true },
  { t: ". Identifiers are prefixed strings (" },
  { t: "prd_ / var_ / lot_ / ord_ / res_ / ret_ / ref_ / job_ / rdr_ / stf_", mono: true },
  { t: "); timestamps are UTC ISO-8601; money is integer minor units (pesewas, currency GHS); quantities are decimal strings such as \"1.5\", never floats; catalogue reads paginate with page and perPage; and checkout, POS completion and payment attempts carry idempotency keys whose replays return the original result without re-consuming stock. The error vocabulary is closed and small, which is what makes the client-side handling exhaustive." },
]));
bodyChildren.push(tableTitle("Table 4: Error codes with proposed HTTP mapping"));
bodyChildren.push(dataTable(
  ["Code", "Meaning", "HTTP"],
  [
    [[{ t: "OUT_OF_STOCK", mono: true }], "Requested quantity exceeds available-to-sell; details carry line-level conflicts", "409"],
    [[{ t: "RESERVATION_EXPIRED", mono: true }], "Hold expired before completion", "409"],
    [[{ t: "VERSION_CONFLICT", mono: true }], "Concurrent modification (backend duty)", "409"],
    [[{ t: "PAYMENT_PENDING", mono: true }], "Electronic payment not confirmed yet", "400"],
    [[{ t: "PAYMENT_REQUIRES_REVIEW", mono: true }], "Outcome needs staff or provider reconciliation", "400"],
    [[{ t: "REFUND_LIMIT_EXCEEDED", mono: true }], "Return or refund beyond eligible original balance", "400"],
    [[{ t: "DELIVERY_ZONE_UNSUPPORTED", mono: true }], "Zone inactive or unknown", "400"],
    [[{ t: "FORBIDDEN", mono: true }], "Actor lacks permission (role and rider checks)", "403"],
    [[{ t: "VALIDATION_FAILED", mono: true }], "Input validation or state-machine violation", "400"],
    [[{ t: "NETWORK / BAD_RESPONSE / SERVICE_UNAVAILABLE", mono: true }], "Transport honesty (client-side, offline demo mode)", "- / 503"],
  ],
  [34, 50, 16],
));
bodyChildren.push(h2("4.3 Operation surface by namespace"));
bodyChildren.push(body([
  { t: "The mock router currently dispatches 91 top-level operations. The namespace split below is also the natural split for backend service boundaries or ownership assignment. The " },
  { t: "admin", mono: true },
  { t: " namespace is the largest because it covers the entire back office; " },
  { t: "demo", mono: true },
  { t: " operations exist only to drive the simulation controls and are removed in production. Full request and response shapes for every operation are specified in " },
  { t: "docs/API_CONTRACTS.md", mono: true },
  { t: "." },
]));
bodyChildren.push(tableTitle("Table 5: Operation count by namespace (router.ts)"));
bodyChildren.push(dataTable(
  ["Namespace", "Ops", "Covers"],
  [
    [[{ t: "admin.*", mono: true }], "62", "Back office: catalogue, inventory, purchasing, orders, POS, dispatch, riders, returns, refunds, payments, customers, reports, AI, team, audit, settings, demo controls"],
    [[{ t: "checkout.*", mono: true }], "6", "Quote, zones, slots, address validation, order creation, payment initiation"],
    [[{ t: "account.*", mono: true }], "6", "Customer account: orders, addresses, lists (wishlist / repeat / budget), returns"],
    [[{ t: "rider.*", mono: true }], "5", "Rider login, today's jobs, job detail, job actions, history"],
    [[{ t: "catalog.*", mono: true }], "4", "Public catalogue: categories, product list, product detail, search"],
    [[{ t: "demo.*", mono: true }], "3", "Simulation flags: latency, offline mode, forced payment failure (dev only)"],
    [[{ t: "orders.*", mono: true }], "2", "Public order tracking by reference and verification code"],
    [[{ t: "ai.*", mono: true }], "2", "Assistant conversation and business-question endpoints"],
    [[{ t: "returns.*", mono: true }], "1", "Public return creation from account area"],
  ],
  [22, 10, 68],
));
bodyChildren.push(h2("4.4 Recommended connection order"));
bodyChildren.push(body([
  { t: "The order below is risk-ranked: each capability de-risks the next, because later capabilities depend on the data and invariants established by earlier ones. Connecting catalogue reads first lets the team validate the availability formula end-to-end before any money or fulfilment is attached. The domain model in " },
  { t: "src/types/domain.ts", mono: true },
  { t: " is a complete, typed sketch of the data model starter, and the seeds in " },
  { t: "src/services/mock/seed-*.ts", mono: true },
  { t: " double as fixture specifications for the first migration and test data." },
]));
bodyChildren.push(tableTitle("Table 6: Risk-ranked connection order"));
bodyChildren.push(dataTable(
  ["#", "Capability", "Why in this position", "Key note for the backend"],
  [
    ["1", "Catalogue + inventory read API", "Every screen depends on it; validates the availability formula end-to-end", [{ t: "Implement availableToSell in SQL with row locking: sellable lots - active reservations - safety stock", mono: true }]],
    ["2", "Reservation + depletion transactions", "The core invariant: atomic multi-line holds, single depletion event, idempotency", "Wrap in DB transactions; keep stockConsumedAt as the once-only marker"],
    ["3", "Orders + status machines", "Order detail, fulfilment and tracking all read these", "Enforce the five status dimensions server-side exactly as the mock models them"],
    ["4", "Authentication + roles", "Staff and rider logins replace the demo pickers", "Enforce the permission matrix on every operation (docs/PERMISSIONS.md)"],
    ["5", "Payments (Hubtel candidate)", "Real money", "Server-side outcome verification only; keep idempotency keys, duplicate-callback handling, late-payment review"],
    ["6", "Dispatch + riders", "Operations", "Provider adapter per courier: quote / book / cancel / status / webhook / POD; manual booking fallback stays"],
    ["7", "Returns / refunds ledger", "Financial correctness", "Cumulative limits, dispositions, manual-recording controls; authoritative tax treatment is owner-configured"],
    ["8", "Reports / AI", "Derivative of the ledger", "Reports read the ledger; AI adapters stay provider-neutral with review-before-execute"],
  ],
  [5, 22, 33, 40],
));
bodyChildren.push(h2("4.5 Verify-first scenarios"));
bodyChildren.push(body([
  { t: "Each connected capability should be verified against a seeded demo it can be compared with. The nine scenarios below are the fastest confidence builders, in production-parity order; each maps to a seeded order or product in the demo data and to an acceptance check that already passes in the prototype." },
]));
const vf = [
  [{ t: "Zero-availability variant disappears from lists and search but resolves with an unavailable state on a saved link (demo product: Sachet Water)." }],
  [{ t: "Atomic multi-line checkout: force a conflict on the last unit (demo product: Frozen Chicken) and confirm line-level errors with no stray holds." }],
  [{ t: "Reserve online, then confirm POS is blocked on the same final unit." }],
  [{ t: "Dispatch pickup consumes stock exactly once; replaying the action does not double-deduct." }],
  [{ t: "A late payment after reservation expiry reaches staff review, then either re-reserves or cancels with refund." }],
  [{ t: "Partial return with a consistent refund preview; a second refund beyond the paid balance is rejected." }],
  [{ t: "A damaged return disposition never restocks." }],
  [{ t: "COD delivery, cash collection and rider remittance are three separate recorded events." }],
  [{ t: "Cashier session close records the expected vs counted difference with a note." }],
];
for (const item of vf) bodyChildren.push(numbered(item, "verify-first"));

/* ---- 5. Business rules ---- */
bodyChildren.push(h1("5. Business Rules Encoded in the Prototype"));
bodyChildren.push(body([
  { t: "The prototype encodes the operational rules from the requirements document as executable engines, so the architect inherits tested behaviour rather than prose. Five independent status machines track order state (fulfilment, payment, review, collection and dispatch dimensions separately), which is what allows an order to be, for example, delivered but under payment review without contradictory UI state. The invariants below are the ones most likely to bite a backend implementation, and each has a scripted acceptance check or seeded scenario behind it." },
]));
bodyChildren.push(tableTitle("Table 7: Invariants the backend must preserve"));
bodyChildren.push(dataTable(
  ["Rule", "Prototype behaviour"],
  [
    ["Availability formula", [{ t: "availableToSell = sellable lots - active reservations - safety stock", mono: true }, { t: ", recomputed on every read with expiry sweeps" }]],
    ["Atomic multi-line reservation", "Checkout either reserves every line or fails with line-level conflicts; no partial holds survive a failure"],
    ["Single depletion event", [{ t: "stockConsumedAt", mono: true }, { t: " marks the once-only stock consumption; re-arrival of stock goes through receiving, not a second depletion" }]],
    ["Idempotent money paths", "Checkout, POS completion and payment attempts accept idempotency keys; replays return the original result and never double-consume"],
    ["Duplicate payment callbacks", "Callback count is tracked; a repeated success callback is acknowledged without side effects"],
    ["Late payment handling", "Payment succeeding after reservation expiry produces PAYMENT_REQUIRES_REVIEW for staff, never auto-consumption"],
    ["FEFO lot consumption", "Fulfilment allocates lots by earliest expiry first; quarantined, damaged and disposal lots are never sellable"],
    ["COD triple-event", "Delivery, cash collection and rider remittance are recorded as three separate timestamped events"],
    ["Refund ceiling", "Refunds are capped at the eligible original balance across all returns of an order"],
    ["Substitution integrity", "A substitute line links to the original line; pricing and audit reflect the replacement, not a silent edit"],
  ],
  [30, 70],
));

/* ---- 6. Verification evidence ---- */
bodyChildren.push(h1("6. Verification Evidence"));
bodyChildren.push(body([
  { t: "Verification was layered so that each layer catches what the previous cannot. The scripted layer (" },
  { t: "scripts/acceptance-checks.sh", mono: true },
  { t: ") asserts 21 business rules against the running service and passes 21 of 21. The static layer runs ESLint over the entire source tree and is clean. The route layer confirmed HTTP 200 on all 48 application routes at build time, and the 26 back-office routes were re-verified on 9 October 2026. The browser layer drove the full golden path (shop, add to cart, checkout, payment status, tracking), the POS flow, the offline-honesty behaviour and overflow checks at 360, 768 and 1440 pixel widths, with screenshots stored in " },
  { t: "docs/screenshots/", mono: true },
  { t: "." },
]));
bodyChildren.push(body([
  { t: "Two defects found by browser verification were fixed during the build and re-verified: a rider job view that errored after a successful mutation (stale identifier passed after navigation), and three React set-state-in-effect warnings caught by ESLint. A final UX polish pass applied an 8-point spacing rule between form labels and controls and extended pointer-cursor coverage to all interactive widgets (selects, menu items, tabs, options), verified by computed-style checks in the running app." },
]));
bodyChildren.push(body([
  { t: "The honest boundary: this is a single-process mock with no persistence, no real payments, no couriers and no authentication. The verification above proves the rules and the contracts, not production scalability. Concurrency control (row locking, transaction isolation) is a backend responsibility that the mock models logically but cannot exercise physically." },
]));

/* ---- 7. Repository access ---- */
bodyChildren.push(h1("7. Repository Access and Read Order"));
bodyChildren.push(body([
  { t: "The source is published at " },
  { t: "https://github.com/christianagbotah/vgroceries", mono: true },
  { t: " (branch " },
  { t: "main", mono: true },
  { t: ", 246 tracked files, clean four-commit history). Local-only artifacts such as " },
  { t: ".env", mono: true },
  { t: ", the development database and internal logs are excluded by design; " },
  { t: ".env.example", mono: true },
  { t: " lists every environment variable the future integrations expect, as placeholders only. Clone with:" },
]));
bodyChildren.push(new Paragraph({
  spacing: { after: 160, line: 312 },
  indent: { left: 360 },
  children: [new TextRun({ text: "git clone https://github.com/christianagbotah/vgroceries.git", size: 21, color: P.code, font: MONO })],
}));
bodyChildren.push(body([
  { t: "Run locally with " },
  { t: "bun install", mono: true },
  { t: " then " },
  { t: "bun run dev", mono: true },
  { t: " (Node 20+ also works). The demo role switcher in the staff shell provides instant access to every role view, and the rider login screen doubles as the authentication boundary placeholder. The recommended read order for the architecture team, taken from the handoff document, is listed below." },
]));
bodyChildren.push(tableTitle("Table 8: Documentation map and recommended read order"));
bodyChildren.push(dataTable(
  ["Order", "Document", "What it answers"],
  [
    ["1", [{ t: "README.md", mono: true }], "How to run the prototype and feel the workflows"],
    ["2", [{ t: "docs/API_CONTRACTS.md", mono: true }], "The operation contracts the backend implements (with domain models)"],
    ["3", [{ t: "docs/PERMISSIONS.md", mono: true }], "The 8-role, 35-permission matrix and enforcement duties"],
    ["4", [{ t: "docs/DEMO_SCENARIOS.md", mono: true }], "Every seeded business case the team can replay"],
    ["5", [{ t: "docs/KNOWN_ISSUES.md", mono: true }], "The honest boundary list (20 items)"],
    ["6", [{ t: "docs/ROUTES.md", mono: true }], "Full route inventory with per-route behaviour notes"],
    ["7", [{ t: "docs/VERIFICATION.md", mono: true }], "Acceptance checks and browser test evidence"],
    ["8", [{ t: "docs/HANDOFF.md", mono: true }], "The connection order and verify-first plan (source of Section 4)"],
    ["9", [{ t: "docs/MASTER_PROMPT.md", mono: true }], "The original requirements specification (421 lines)"],
  ],
  [10, 32, 58],
));

/* ---- 8. Known boundaries ---- */
bodyChildren.push(h1("8. Known Boundaries and Decisions Needed"));
bodyChildren.push(body([
  { t: "Twenty items are documented in " },
  { t: "docs/KNOWN_ISSUES.md", mono: true },
  { t: ", grouped into deliberate prototype boundaries (no persistence, no real payments, no authentication, single process) and smaller gaps with proposed treatments. None of them blocks integration planning; all of them are stated honestly so the team never discovers a boundary by surprise. The decisions that belong to the architect are concentrated in the table below." },
]));
bodyChildren.push(tableTitle("Table 9: Decisions owned by the architecture team"));
bodyChildren.push(dataTable(
  ["Decision", "Prototype position", "What the team must choose"],
  [
    ["Authentication provider", "Demo role switcher; permission matrix fully modelled", "Provider and session strategy; enforcement stays per-operation"],
    ["Payment provider", "Hubtel is the candidate; nothing connected", "Confirm provider; sandbox-first integration behind the payment operations"],
    ["Delivery providers", "Manual booking and in-house riders; providers render as not connected", "Courier shortlist and the adapter contract priority"],
    ["Datastore and schema ownership", "PostgreSQL proposed; types in src/types/domain.ts are the schema sketch", "Schema ownership and migration tooling; seeds are the fixture spec"],
    ["Tax treatment", "Inclusive pricing modelled; authoritative rates are owner-configured", "Tax authority rules for returns and refunds ledger"],
    ["AI provider", "Provider-neutral adapters; deterministic mock output", "Provider, model and the review-before-execute policy in production"],
  ],
  [24, 36, 40],
));
bodyChildren.push(body([
  { t: "With those decisions made, the integration work reduces to implementing the contracts behind the swap point in the order of Table 6, verifying each capability against the scenarios of Section 4.5. The prototype remains available throughout as the behavioural reference: every rule the backend must satisfy is already expressed as an executing, testable operation rather than a description, which is the strongest form of specification this handoff can offer." },
]));

/* ============ document assembly ============ */
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FONT_H, size: 32, bold: true, color: P.primary },
        paragraph: { spacing: { before: 360, after: 160, line: 312 } },
      },
      heading2: {
        run: { font: FONT_H, size: 28, bold: true, color: P.primary },
        paragraph: { spacing: { before: 240, after: 120, line: 312 } },
      },
    },
  },
  numbering: {
    config: [{
      reference: "verify-first",
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  sections: [
    { /* Section 1: cover - no page numbers, no header/footer */
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: cover,
    },
    { /* Section 2: front matter (TOC) - roman numerals */
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter() },
      children: tocChildren,
    },
    { /* Section 3: body - arabic from 1 */
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter() },
      children: bodyChildren,
    },
  ],
});

const OUT = "download/Variety-Groceries-Delivery-and-Integration-Report.docx";
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE", OUT, buf.length, "bytes");
});
