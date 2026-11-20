import type {ManualRole,ManualScreen} from "./catalogue";
import {MANUAL_READINESS_LABELS,MANUAL_ROLE_LABELS,screenLink} from "./catalogue";
import type {ManualWorkflow} from "./workflows";
import {manualVisual} from "./visual-model";

const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,char=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
}[char]!));
const safe=(value:string)=>escapeHtml(value);
const sectionId=(i:number)=>"screen-"+i;
const flowId=(i:number)=>"flow-"+i;

export function createOfflineManualHtml(role:ManualRole,screens:ManualScreen[],flows:ManualWorkflow[]):string{
  const toc=[
    ...flows.map((flow,i)=>`<a href="#${flowId(i)}">${safe(flow.title)}</a>`),
    ...screens.map((screen,i)=>`<a href="#${sectionId(i)}">${safe(screen.title)}</a>`),
  ].join("");
  const flowItems=flows.map((flow,i)=>`
    <section class="chapter" id="${flowId(i)}">
      <p class="kicker">WORKFLOW ${String(i+1).padStart(2,"0")}</p><h2>${safe(flow.title)}</h2>
      <p>${safe(flow.summary)}</p>
      <div class="journey">${flow.stages.map((stage,j)=>`
        <div class="node"><span class="step">${j+1}</span><strong>${safe(stage)}</strong></div>
        ${j<flow.stages.length-1?'<span class="arrow" aria-hidden="true">→</span>':""}`).join("")}</div>
      <p class="guard"><strong>Control gate:</strong> ${safe(flow.gate)}</p>
      <p><strong>After this:</strong> ${safe(flow.whatNext)}</p>
    </section>`).join("");
  const screenItems=screens.map((screen,i)=>`
    <section class="chapter" id="${sectionId(i)}">
      <p class="kicker">SCREEN ${String(i+1).padStart(2,"0")} · ${safe(screen.section)}</p>
      <h2>${safe(screen.title)}</h2>
      <p><code>${safe(screen.path)}</code> <span class="pill">${safe(MANUAL_READINESS_LABELS[screen.readiness])}</span></p>
      ${["pending","staging","absent"].includes(screen.readiness)?`<p class="guard"><strong>Not yet an approved release route:</strong> ${safe(screen.releaseSource??"Independent source")}. Current source and staging route sets differ. Do not visit or test this route until protected portal/API parity and role acceptance are complete.</p>`:""}
      <div class="diagram" role="img" aria-label="Illustrative navigation map for ${safe(screen.title)}">
        <div class="diagram-head">VARIETY GROCERIES · ${safe(screen.section)}</div>
        <div class="diagram-main">
          <div class="diagram-nav">① Navigation<br><small>${safe(screen.section)}</small><br><small>${safe(screen.title)}</small></div>
          <div class="diagram-body">
            <strong>② ${safe(screen.title)}</strong>
            <div class="diagram-box">Purpose: ${safe(screen.purpose)}</div>
            <div class="blueprint blueprint-${manualVisual(screen).kind}">
              <strong>Illustrated ${safe(manualVisual(screen).heading)}</strong>
              <div class="blueprint-steps">${manualVisual(screen).elements.map((element,j)=>
                `<span><b>${j+1}</b> ${safe(element)}</span>`).join("")}</div>
              <p class="blueprint-note">${safe(manualVisual(screen).emphasis)}</p>
            </div>
            <div class="diagram-box">③ Key action: ${safe(screen.action)}</div>
            <div class="diagram-footer">④ Review: ${safe(screen.check)}</div>
          </div>
        </div>
      </div>
      <p class="caption">Annotated conceptual screen map — not a captured screenshot. Confirm actual controls and permissions during role-based UAT.</p>
      <ol><li><strong>Locate:</strong> Open the relevant navigation area and choose <em>${safe(screen.title)}</em>.</li>
      <li><strong>Understand:</strong> ${safe(screen.purpose)}</li>
      <li><strong>Perform:</strong> ${safe(screen.action)}</li>
      <li><strong>Verify:</strong> ${safe(screen.check)}</li></ol>
      <p><strong>Navigation:</strong> ${["pending","staging","absent"].includes(screen.readiness)
        ? "Manual link disabled pending reviewed release-pair parity and authenticated role acceptance. Follow only the approved release route."
        : screen.path.includes("[")
          ? `Open the parent list ${safe(screenLink(screen.path))}, then select the correct record.`
          : `Go to ${safe(screen.path)} on the application domain.`}</p>
    </section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <meta name="robots" content="noindex,nofollow"/>
    <title>Variety Groceries — ${safe(MANUAL_ROLE_LABELS[role])} — User Manual</title>
    <style>
      :root{font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#21372e;background:#f6f8f5}
      *{box-sizing:border-box}body{margin:0;line-height:1.6}a{color:#145b3b;text-decoration:none}
      .cover{padding:65px max(20px,calc((100vw - 900px)/2));background:#123d2e;color:#fff}
      .cover .eyebrow{color:#e7cb8d;letter-spacing:.16em;font-weight:700}
      .cover h1{font-size:clamp(33px,5vw,60px);line-height:1.1;margin:14px 0}
      .cover p{max-width:760px;color:#e5f1e8}
      .container{max-width:1050px;margin:auto;padding:24px}
      .toc{columns:2;column-gap:20px;border:1px solid #d7e3d8;border-radius:16px;padding:20px;background:#fff}
      .toc a{display:block;padding:5px 0;break-inside:avoid}
      .chapter{break-before:page;background:#fff;border:1px solid #e0e9e0;border-radius:16px;padding:28px;margin:25px 0}
      .chapter h2{font-size:27px;margin:5px 0 14px;line-height:1.22}
      .kicker{font-size:12px!important;font-weight:800;letter-spacing:.12em;color:#547960}
      .pill{display:inline-block;border-radius:18px;background:#eff2e9;padding:2px 9px;font-size:12px;font-weight:700}
      .journey{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:20px 0}
      .node{display:flex;align-items:center;gap:9px;border:1px solid #c3ddc6;background:#eef8f0;border-radius:10px;padding:10px 12px;max-width:250px;font-size:13px}
      .step{border-radius:99px;background:#195941;color:white;padding:2px 7px}
      .arrow{font-size:22px;color:#67957b}
      .guard{background:#fff5dc;border-left:4px solid #be994e;padding:12px}
      .diagram{margin:14px 0;border:1px solid #bccfbe;border-radius:12px;overflow:hidden;font-size:12px}
      .diagram-head{padding:9px 14px;background:#154a35;color:#fff;font-weight:800;letter-spacing:.05em}
      .diagram-main{display:grid;grid-template-columns:minmax(105px,25%) 1fr;min-height:180px}
      .diagram-nav{padding:13px;background:#ecf2ea;line-height:2;color:#315a43}
      .diagram-body{padding:13px;min-width:0}
      .diagram-box{padding:9px;margin-top:9px;background:#f6f8f5;border:1px solid #e4e9df;border-radius:7px}
      .diagram-footer{margin-top:9px;color:#795b2b}
      .blueprint{margin:10px 0;border:1px solid #cadfd0;background:#f1f8f2;border-radius:10px;padding:12px}
      .blueprint strong{color:#1d583b}
      .blueprint-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}
      .blueprint-steps span{min-width:0;overflow-wrap:anywhere;border:1px solid #d2dfd4;background:#fff;border-radius:7px;padding:9px;font-size:11px}
      .blueprint-steps b{display:inline-block;padding:2px 6px;margin-right:4px;background:#1f6246;color:#fff;border-radius:50%}
      .blueprint-note{font-size:11px;color:#775a2e;border-left:3px solid #c5a769;padding-left:9px}
      .blueprint-checkout,.blueprint-cash{background:#fff9eb;border-color:#e8d9a8}
      .blueprint-rider{max-width:360px;margin-left:auto;margin-right:auto;border-left:7px solid #1b5a3f}
      .blueprint-timeline .blueprint-steps{grid-template-columns:1fr}
      .blueprint-dashboard .blueprint-steps span{min-height:66px}
      .blueprint-catalogue .blueprint-steps{grid-template-columns:repeat(4,minmax(0,1fr))}
      .caption{font-size:12px;color:#66736a}code{overflow-wrap:anywhere}
      .fine{font-size:12px;color:#d4e4d9}
      @page{margin:14mm;size:A4}
      @media(max-width:670px){.toc{columns:1}.cover{padding:40px 22px}.chapter{padding:17px}.diagram-main{grid-template-columns:100px 1fr}.blueprint-catalogue .blueprint-steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media print{body{background:white}.container{padding:0}.chapter{border:0;border-radius:0;margin:0;padding:15px 0;break-before:page}.cover{break-after:page;padding:35mm 10mm}.toc{break-after:page}.node,.diagram-head,.diagram-nav,.diagram-box,.guard{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <header class="cover">
        <p class="eyebrow">VG · VARIETY GROCERIES</p>
        <h1>System user manual<br/>& workflow atlas</h1>
        <p><strong>Edition:</strong> 20 November 2026 · ${safe(MANUAL_ROLE_LABELS[role])}</p>
        <p>${screens.length} documented application screens · ${flows.length} process diagrams · role-scoped training edition.</p>
        <p class="fine">Source-verified training material. Illustrations are annotated schematics, not actual screenshots. Screen availability and backend permissions depend on the deployed release and enabled UAT flags.</p>
      </header>
      <main class="container">
        <h2>How to use this manual</h2>
        <p>Follow the navigation below. Each screen has an actual route, purpose, next action, safety checkpoint and a visual explanation. Process diagrams describe sequence and separation of responsibilities. Administrative access is never granted by this document.</p>
        <p><strong>Readiness:</strong> This product is under staged acceptance. The administrator edition distinguishes 79 main-derived source pages (5 absent from the inspected running portal), 8 staging-only pages awaiting source parity, and 2 unmerged draft POS pages. None of these observations grants access, payment, stock, courier, refund, invoice or COD settlement authority.</p>
        <p><strong>Role truth:</strong> The backend currently recognizes administrator, inventory manager, cashier, rider and customer. Specialist roles such as operations manager, inventory officer, picker/packer, dispatcher and finance/refund reviewer appear in demo/design menus but are not separately activated production grants. Only authenticated server permissions authorize business actions.</p>
        <h2>Contents</h2><nav class="toc" aria-label="Manual chapters">${toc}</nav>
        <h2>Business workflows</h2>${flowItems}
        <h2>Screen-by-screen guide</h2>${screenItems}
        <footer><p>Variety Groceries · Lightworld Technologies Ltd. · Educational reference only. Confirm enabled modules and approved operational policies before use.</p></footer>
      </main>
    </body></html>`;
}

export function downloadOfflineManual(role:ManualRole,screens:ManualScreen[],flows:ManualWorkflow[]){
  const html=createOfflineManualHtml(role,screens,flows);
  const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=`variety-groceries-user-manual-${role}-2026-11-20.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Android downloads can take longer to start; do not revoke immediately.
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
export function printManualAsPdf(role:ManualRole,screens:ManualScreen[],flows:ManualWorkflow[]){
  // User-initiated popup: the browser can Print > Save as PDF. The complete,
  // role-filtered manual (not only the currently selected screen) is printed.
  const popup=window.open("","_blank");
  if(!popup)return false;
  popup.document.open();
  popup.document.write(createOfflineManualHtml(role,screens,flows));
  // Print once the full multi-chapter manual has rendered, not while the
  // document is still being parsed (which can produce blank PDFs on mobile).
  popup.addEventListener("load",()=>{popup.focus();popup.print();},{once:true});
  popup.document.close();
  return true;
}
