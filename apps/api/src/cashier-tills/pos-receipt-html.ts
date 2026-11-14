/** Print-safe, data-only 80 mm cash receipt. No scripts, requests, fonts,
 * tax invoice claims, customer phone/email or mutable catalog lookup.
 */
export interface PosCashReceiptPrintData {
  reference:string;
  tillCode:string;
  customerName:string;
  createdAt:Date;
  subtotalMinor:number;
  cashReceivedMinor:number;
  changeGivenMinor:number;
  lines:readonly {
    productName:string;
    variantName:string;
    unit:string;
    quantity:string;
    unitPriceMinor:number;
    lineTotalMinor:number;
  }[];
}

const escapeHtml=(value:string)=>String(value).replace(/[&<>"']/g,c=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"} as Record<string,string>)[c]??c
);
const money=(minor:number)=>{
  if(!Number.isSafeInteger(minor)||minor<0||minor>100000000)
    throw new Error("Invalid receipt currency amount");
  return "₵"+(minor/100).toFixed(2);
};
const localTime=(value:Date)=>new Intl.DateTimeFormat("en-GH",{
  timeZone:"Africa/Accra",dateStyle:"medium",timeStyle:"short",
}).format(value);

export function renderPosCashReceiptHtml(data:PosCashReceiptPrintData):string{
  if(!data.lines.length||data.lines.length>100)
    throw new Error("Immutable receipt items are required");
  const total=data.lines.reduce((sum,line)=>sum+line.lineTotalMinor,0);
  if(total!==data.subtotalMinor||
    data.cashReceivedMinor-data.changeGivenMinor!==total)
    throw new Error("Immutable receipt cash and item totals do not match");
  const body=data.lines.map(line=>
    "<tr><td><strong>"+escapeHtml(line.productName)+
    "</strong><small>"+escapeHtml(line.variantName)+" · "+
    escapeHtml(line.unit)+"</small></td>"+
    "<td class='qty'>"+escapeHtml(line.quantity)+"</td>"+
    "<td class='right'>"+escapeHtml(money(line.unitPriceMinor))+"</td>"+
    "<td class='right'>"+escapeHtml(money(line.lineTotalMinor))+"</td></tr>"
  ).join("");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Cash receipt '+escapeHtml(data.reference)+'</title>',
    "<style>",
    "@page{size:80mm auto;margin:4mm}",
    "html{font-family:system-ui,Arial,sans-serif;color:#151515;background:#f7f7f7}",
    "body{margin:0;padding:20px}",
    ".paper{width:80mm;max-width:100%;box-sizing:border-box;background:white;padding:12px;margin:auto;border:1px solid #ddd}",
    "h1{font-size:18px;text-align:center;margin:0 0 6px}",
    "h2{font-size:12px;text-align:center;margin:0 0 12px;letter-spacing:.06em}",
    ".muted{color:#555;font-size:10px;text-align:center}",
    ".rule{border:0;border-top:1px dashed #555;margin:12px 0}",
    ".meta{font-size:11px;display:grid;grid-template-columns:1fr auto;gap:5px}",
    "table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}",
    "th{text-align:left;border-bottom:1px solid #222;padding:5px 1px}",
    "td{vertical-align:top;padding:7px 1px;overflow-wrap:anywhere}",
    "th:first-child{width:45%}th:nth-child(2){width:12%}th:nth-child(3){width:20%}",
    "small{display:block;color:#555;font-size:9px;margin-top:2px}",
    ".right{text-align:right}.qty{text-align:center}",
    ".totals{display:grid;grid-template-columns:1fr auto;gap:6px;font-size:12px}",
    ".totals strong{font-size:13px}",
    ".footer{text-align:center;font-size:10px;margin-top:14px}",
    "@media print{html,body{background:white;margin:0;padding:0}.paper{border:0;margin:0;width:100%;padding:0}}",
    "</style></head><body><main class='paper'>",
    "<h1>VARIETY GROCERIES</h1>",
    "<h2>CASH SALE RECEIPT</h2>",
    "<div class='meta'><span>Reference</span><strong>"+
      escapeHtml(data.reference)+"</strong>",
    "<span>Date · Ghana time</span><span>"+
      escapeHtml(localTime(data.createdAt))+"</span>",
    "<span>Till</span><span>"+escapeHtml(data.tillCode)+"</span>",
    "<span>Customer</span><span>"+escapeHtml(data.customerName)+"</span>",
    "<span>Payment</span><span>CASH</span></div>",
    "<hr class='rule'>",
    "<table aria-label='Purchased grocery items'><thead><tr>",
    "<th>Item</th><th>Qty</th><th class='right'>Unit</th>",
    "<th class='right'>Amount</th></tr></thead><tbody>",
    body,"</tbody></table>",
    "<hr class='rule'>",
    "<div class='totals'>",
    "<strong>Total</strong><strong>"+escapeHtml(money(data.subtotalMinor))+"</strong>",
    "<span>Cash received</span><span>"+escapeHtml(money(data.cashReceivedMinor))+"</span>",
    "<span>Change given</span><span>"+escapeHtml(money(data.changeGivenMinor))+"</span>",
    "</div>",
    "<hr class='rule'>",
    "<div class='footer'><strong>Goods handed over · Cash counted</strong>",
    "<p class='muted'>Internal cash sale confirmation. NOT A TAX INVOICE.</p>",
    "<p class='muted'>Keep this reference for enquiries.</p></div>",
    "</main></body></html>",
  ].join("\n");
}
