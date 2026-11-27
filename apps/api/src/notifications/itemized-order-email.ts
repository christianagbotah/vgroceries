/** Receipt presentation only; payment and recipient authority remain with the dispatcher. */
const origin = "https://portal.varietygroceries.com";
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const money = (n: number) => "₵" + (n / 100).toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2});
export function publicProductImage(value: string | null | undefined): string | null {
 if (!value || value.length > 512) return null;
 try {
  const u = new URL(value, origin);
  if (u.origin !== origin || u.username || u.password || u.search || u.hash ||
      !/^\/media\/products\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(u.pathname)) return null;
  return u.href;
 } catch { return null; }
}
export type EmailOrderLine = { productName:string; variantName:string; quantity:string; unit:string; unitPriceMinor:number; lineTotalMinor:number; image?:string|null };
type EmailOrder = {reference:string;subtotalMinor:number;discountMinor:number;deliveryFeeMinor:number;totalMinor:number;paymentStatus:string;lines:EmailOrderLine[]};
function renderOrderEmail(copy:{subject:string;body:string}, order:EmailOrder, limit:number){
 const shown=order.lines.slice(0,limit);
 const tracking=origin+"/track?reference="+encodeURIComponent(order.reference);
 const clip=(v:string)=>v.slice(0,120);
 const label=(l:EmailOrderLine)=>clip(l.productName)+(l.variantName?" — "+clip(l.variantName):"");
 const overflow=order.lines.length>shown.length?"Additional items are available in your order details.":"";
 const totals=[["Subtotal",order.subtotalMinor],["Discount",-order.discountMinor],["Delivery",order.deliveryFeeMinor],["Order total",order.totalMinor]] as const;
 const body=[copy.body,"","Order items",...shown.map(l=>label(l)+" | "+clip(l.quantity)+" "+clip(l.unit)+" × "+money(l.unitPriceMinor)+" | "+money(l.lineTotalMinor)),overflow,...totals.map(([k,v])=>k+": "+money(v)),"Payment status: "+order.paymentStatus,"View order updates: "+tracking].filter(Boolean).join("\n");
 const rows=shown.map(l=>{
  const image=publicProductImage(l.image);
  return '<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;width:64px">'+(image?'<img width="56" height="56" style="display:block;border-radius:6px;object-fit:contain" src="'+esc(image)+'" alt="'+esc(clip(l.productName))+'">':'')+'</td><td style="padding:10px;border-bottom:1px solid #e5e7eb"><strong>'+esc(label(l))+'</strong><br><span style="color:#555">'+esc(clip(l.quantity)+" "+clip(l.unit)+" × "+money(l.unitPriceMinor))+'</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid #e5e7eb;white-space:nowrap">'+esc(money(l.lineTotalMinor))+'</td></tr>';
 }).join("");
 const html='<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:Arial,sans-serif;color:#202020"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 8px"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:12px" cellspacing="0" cellpadding="0"><tr><td style="padding:24px"><img src="'+origin+'/brand/variety-lockup.svg" width="180" alt="Variety Groceries"><h1 style="font-size:22px">'+esc(copy.subject)+'</h1><p>'+esc(copy.body)+'</p><h2 style="font-size:17px">Order '+esc(order.reference)+'</h2><table width="100%" cellspacing="0" cellpadding="0">'+rows+'</table><p>'+esc(overflow)+'</p><table width="100%" cellspacing="0" cellpadding="5">'+totals.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td align="right">'+esc(money(v))+'</td></tr>').join("")+'</table><p>Payment status: '+esc(order.paymentStatus)+'</p><p><a style="display:inline-block;background:#8b651f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px" href="'+esc(tracking)+'">View order updates</a></p><p style="font-size:12px;color:#666">Variety Groceries · Transactional order update</p></td></tr></table></td></tr></table></body></html>';
 return {subject:copy.subject,body,html};
}

/** Bound both alternatives before claiming a send: large carts keep totals and a secure tracking link. */
export function itemizedOrderEmail(copy:{subject:string;body:string}, order:EmailOrder) {
 let limit=Math.min(40,order.lines.length);
 for (;;) {
  const result=renderOrderEmail(copy,order,limit);
  if (Buffer.byteLength(result.body,"utf8") <= 24000 && Buffer.byteLength(result.html,"utf8") <= 20000) return result;
  if (limit === 0) throw Error("Order email exceeds transport limit.");
  limit=Math.floor(limit/2);
 }
}
