import {writeFileSync} from "node:fs";
import {join} from "node:path";
import {
  MANUAL_READINESS_LABELS,MANUAL_ROLE_LABELS,MANUAL_SCREENS,
  screensForRole,
} from "../src/features/manual/catalogue";
import {MANUAL_WORKFLOWS,workflowsForRole} from "../src/features/manual/workflows";
import {manualVisual} from "../src/features/manual/visual-model";

const esc=(text:string)=>text.replaceAll("|","\\|");
const mermaidLabel=(text:string)=>text.replaceAll('"',"'").replace(/[<>]/g,"").replace(/\\s+/g," ").trim().slice(0,112);
const sections=[
"# Variety Groceries — complete role-based system manual (source edition)",
"",
"**Reviewed 20 November 2026** against actual Next.js screen routes and separately gated backend authorities.",
"",
"> **Release warning:** This is a source-level training and UAT document, not authorization to take payment, move stock, approve refunds, collect COD, send SMS, use AI to modify records, or replace the staging portal. Preview and gated screens are not certified live. All diagrams are **annotated conceptual maps**, not screenshots.",
"",
"## Open, navigate and download",
"",
"- The in-app manual is available at **/manual** from the storefront Help navigation, administrator sidebar and authenticated cashier portal; the legacy rider portal links to **/rider/guide**.",
"- Screen guides include actual application route, purpose, the next user action, an independent verification checkpoint and an annotated screen map.",
"- Search, chapter navigation, next/previous, workflow selection and a role-scoped PDF print command are available. The **Download manual** control generates a single offline HTML document with an internal table of contents and every guide chapter relevant to the current authenticated role. **Print / Save PDF** opens that complete edition for browser printing.",
"- Real roles come from the authenticated **/auth/me** response. Guests receive only customer/shared instructions (legacy rider demo route only rider/shared). The role selector is shown to verified administrators only. Admin sees all guides; a documented task never grants API permissions.",
"- The standalone HTML edition is created only after a user-initiated download; unauthenticated visitors receive customer-safe (or rider-demo-safe) chapters only. Do not serve an unfiltered admin PDF from a public route. No credentials, provider secrets, customer records or real account data appear in the manual.",
"",
"## Role visibility",
"",
"| Verified role | Visible screen guides | Workflow diagrams | Notes |",
"|---|---:|---:|---|",
...(["admin","customer","inventory_manager","cashier","rider"] as const).map(role=>
  `| ${MANUAL_ROLE_LABELS[role]} | ${screensForRole(role).length} | ${workflowsForRole(role).length} | ${role==="admin"?"All role views; preview as each role without changing backend permissions.":"Only role-specific and common guidance; actual API grants remain server-enforced."} |`),
"",
"## Overall business process",
"",
"```mermaid",
"flowchart LR",
"  A[Customer product / basket] --> B[Authoritative server quote]",
"  B --> C[Reserved inventory and pending order]",
"  C --> D{Verified provider or COD?}",
"  D -->|Provider verified| E[Payment state may become paid]",
"  D -->|Not verified| F[Pending / failed; no paid claim]",
"  E --> G[Pick, pack and verified stock handover]",
"  G --> H[Dispatch / pickup proof]",
"  H --> I[Post-delivery support, inspection or return claim]",
"  I --> J{Separately approved refund or stock disposition}",
"  J --> K[Refund reconciliation or inspected custody]",
"```",
"",
"## Role-specific workflows",
"",
...MANUAL_WORKFLOWS.flatMap((flow,fi)=>{
  const nodes=flow.stages.map((step,i)=>`  S${i}["${step.replaceAll('"',"'")}"]`);
  const edges=flow.stages.slice(1).map((_,i)=>`  S${i} --> S${i+1}`);
  return [
    `### ${fi+1}. ${flow.title}`,"",
    `**Primary audience:** ${flow.audience}. ${flow.summary}`,"",
    "```mermaid","flowchart LR",...nodes,...edges,"```","",
    `**Critical control:** ${flow.gate}`,"",
    `**Next step:** ${flow.whatNext}`,"",
  ];
}),
"## Screen-by-screen reference",
"",
...MANUAL_SCREENS.flatMap((screen,i)=>{
  const diagram=manualVisual(screen);
  return [
  `### ${String(i+1).padStart(2,"0")}. ${esc(screen.title)}`,"",
  `**Route:** \`${screen.path}\` · **Audience:** ${screen.audience} · **Status:** ${MANUAL_READINESS_LABELS[screen.readiness]}`,"",
  `- **Purpose:** ${esc(screen.purpose)}`,
  `- **Steps:** Locate the navigation and screen; ${esc(screen.action)}`,
  `- **Verify:** ${esc(screen.check)}`,
  `- **Screen figure:** ${diagram.heading} (${diagram.kind}). The visual below is illustrative, not a screenshot. During UAT, check actual controls against the corresponding authenticated screen.`,"",
  "```mermaid","flowchart LR",
  `  N["① ${mermaidLabel(screen.section)}"] --> V["② ${mermaidLabel(screen.title)}"]`,
  `  V --> A["③ ${mermaidLabel(diagram.elements[2]??screen.action)}"]`,
  `  A --> C["④ ${mermaidLabel(diagram.emphasis)}"]`,
  "```","",
];
}),
"## UAT and screenshot capture plan",
"",
"**Screenshot coverage**: each of the 79 existing screens must be captured on the same release SHA using approved sample/test identities. Before embedding a real screenshot, verify correct role, product logo, live enabled flags, mobile layout and no private customer information. Mask names, phone numbers, tokens, credentials, receipts, or banking references. Attach one desktop and (where materially different) one mobile screenshot per screen. Do not mistake the conceptual screen diagrams for captured screenshots.",
"",
"**Role/UAT script:** Verify administrator sees every manual section; inventory manager sees only inventory + shared; cashier sees only cashier + shared; rider sees only rider + shared; customer and guest see customer + shared. Test expired sessions, logout/login account change, direct URL access, no admin instruction leakage in visible views, keyboard search, navigation, offline HTML export, print PDF, mobile legibility and screen links.",
"",
"**Operational pre-production gates:** Rehearse two-sided payment-provider status verification and refunds; migration/restore and release rollback; cashier role/receipt/till flow; order and POS shared stock; COD independent count/remittance; physical returns and stock custody; delivery proof; SMS/email delivery; access revocation and audit. The current legacy portal cutover remains blocked by the documented 3049/3052 ↔ 3027/3037 release-parity gate. See `docs/RELEASE_COMPLETION_ROADMAP.md` and `docs/CANONICAL_POS_PORTAL_RELEASE_PARITY_GATE_20261116.md`.",
"",
"**Versioning policy:** Every UI route addition needs a manual chapter and an accompanying screenshot acceptance task. The manual regression suite detects undocumented routes, invalid role scopes and missing workflow coverage.",
"",
];
const output=sections.join("\n").trimEnd()+"\n";
const path=join(process.cwd(),"docs/ROLE_BASED_SYSTEM_MANUAL_20261120.md");
writeFileSync(path,output);
console.log("Generated",path,"screens",MANUAL_SCREENS.length,"workflows",MANUAL_WORKFLOWS.length,"characters",output.length);
