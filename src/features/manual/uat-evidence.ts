import type {ManualScreen} from "./catalogue";
import {MANUAL_READINESS_LABELS,type ManualRole} from "./catalogue";

/** Screenshot/evidence worksheet, not evidence itself. No credentials or
 * production customer records may ever be embedded in generated exports.
 * Every status is initially NOT_TESTED; only a human reviewer may sign off.
 */
export const MANUAL_UAT_HEADER = [
  "Screen number","Screen title","Route","Primary audience",
  "Readiness at source review","Desktop screenshot expected",
  "Desktop screenshot review","Mobile screenshot expected",
  "Mobile screenshot review","Functional UAT","Role and direct URL UAT",
  "Source release SHA","Reviewer","Reviewed at UTC","Evidence notes",
] as const;

function csvCell(value:string):string {
  // Prevent spreadsheet formula injection if future catalogue entries include
  // untrusted text; quote every cell to handle newlines, commas and quotes.
  const neutral=/^[\s]*[=+@\-\t\r]/.test(value)?"'"+value:value;
  return '"' + neutral.replaceAll('"','""') + '"';
}
function screenSlug(path:string):string {
  const cleaned=path
    .replace(/\[([^\]]+)\]/g,"by-$1")
    .replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"")
    .toLowerCase();
  return (cleaned||"home").slice(0,66);
}
export function createManualUatCsv(screens:readonly ManualScreen[]):string {
  const rows=[MANUAL_UAT_HEADER.map(csvCell).join(",")];
  screens.forEach((s,index)=>{
    const key=`vg-${String(index+1).padStart(3,"0")}-${screenSlug(s.path)}`;
    const values=[
      String(index+1),s.title,s.path,s.audience,
      MANUAL_READINESS_LABELS[s.readiness],
      `${key}-desktop.png`,"NOT_TESTED",
      `${key}-mobile.png`,"NOT_TESTED",
      "NOT_TESTED","NOT_TESTED","","","","",
    ];
    rows.push(values.map(csvCell).join(","));
  });
  return rows.join("\r\n")+"\r\n";
}
/** Caller MUST enforce authenticated UI role; data is training-only.
 * Never embed an operator's session token, password, live sample record or
 * fabricated verification timestamp into the downloaded CSV.
 */
export function downloadManualUatCsv(role:ManualRole,screens:readonly ManualScreen[]):void {
  if(role!=="admin")throw new Error("Administrator review required for the complete evidence matrix.");
  const csv=createManualUatCsv(screens);
  const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download="variety-groceries-screen-uat-evidence-template.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
