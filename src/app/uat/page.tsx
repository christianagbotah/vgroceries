import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, ArrowUpRight } from "lucide-react";

export const metadata: Metadata={title:"Private staging test centre",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
const journeys=[
 {role:"Owner / administrator",kind:"Authenticated staging + demo",links:[["Sign in / choose demo role","/staff/login"],["Operations dashboard","/admin"],["Verified test POS","/admin/pos/verified-uat"],["Till management","/admin/pos/till-operations"],["Staff invitations","/admin/team"],["Customer support inbox","/admin/support"]],test:"Check approvals, permissions, till variances and audit history."},
 {role:"Accountant / finance reviewer",kind:"Demo permission testing",links:[["Select finance reviewer","/staff/login"],["Payments and reconciliation","/admin/payments"],["Refund decisions","/admin/refunds"],["Reports","/admin/reports"]],test:"Review cash reports, payment exceptions and refunds without unauthorised stock edits."},
 {role:"Operations manager",kind:"Demo permission testing",links:[["Select operations manager","/staff/login"],["Order management","/admin/orders"],["Fulfilment","/admin/fulfilment"],["Dispatch","/admin/dispatch"]],test:"Confirm order transitions and delivery exceptions using fictional fixtures."},
 {role:"Cashier / counter sales",kind:"Real isolated cash-only API + demo",links:[["Real-role cashier login","/staff/login?next=%2Fstaff%2Fpos"],["Test checkout","/staff/pos"],["Test cash-drawer report","/staff/cashier"],["Demo POS","/admin/pos"]],test:"Use test stock, an assigned location and an open test till; confirm reservation, receipt and change."},
 {role:"Inventory officer / picker",kind:"Inventory manager API + picker demo",links:[["Select inventory or picker role","/staff/login"],["Inventory","/admin/inventory"],["Goods receiving","/admin/inventory/receiving"],["Stocktakes","/admin/inventory/stocktakes"],["Picking queue","/admin/fulfilment"]],test:"Test out-of-stock, expiry, picking and stock correctness across POS and storefront."},
 {role:"Dispatcher / rider",kind:"Demo workflow; real integration pending",links:[["Select dispatcher role","/staff/login"],["Dispatch board","/admin/dispatch"],["Rider login","/rider/login"],["Rider workspace","/rider"]],test:"Test assignment, proof of delivery, failed delivery and mobile usability."},
 {role:"Customer",kind:"Public staged shopping",links:[["Shop","/shop"],["Checkout","/checkout"],["Track verified order","/track"],["Shopping and voice assistant","/assistant"],["Request a callback","/support"],["Account","/account"]],test:"Test search, current stock, cart, checkout, secure tracking and customer assistance."},
];
export default function UatPage(){
 if(process.env.UAT_DEMO_LOGIN!=="1" || process.env.NEXT_PUBLIC_POS_COUNTER_UAT!=="1") notFound();
 return <main className="mx-auto max-w-6xl space-y-6 px-4 py-9">
   <header className="space-y-3">
     <p className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="size-5"/> PRIVATE TEST ENVIRONMENT</p>
     <h1 className="font-serif text-3xl font-black sm:text-4xl">Variety Groceries — role-by-role UAT</h1>
     <p className="max-w-3xl text-base text-muted-foreground">Test every interface before the production launch. Fictional role previews use isolated demo records. Real staging cashier operations use a separate database and individual authenticated staff permissions. These are different types of tests, and neither may process real payments.</p>
     <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Use synthetic customer information and payments only. Demo login can preview more roles than the current live backend supports. A successful demo action is not evidence of a production-safe transaction. Keep the private site access details confidential.</div>
   </header>
   <div className="grid gap-4 md:grid-cols-2">
     {journeys.map(j=><section key={j.role} className="rounded-2xl border bg-card p-5 shadow-sm">
       <h2 className="text-lg font-extrabold">{j.role}</h2><p className="mt-1 text-xs font-semibold text-primary">{j.kind}</p>
       <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{j.test}</p>
       <ul className="mt-4 space-y-2">{j.links.map(([title,url])=><li key={url+title}><Link href={url} className="flex min-h-10 items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:border-primary hover:text-primary">{title}<ArrowUpRight className="size-4"/></Link></li>)}</ul>
     </section>)}
   </div>
   <footer className="rounded-xl border bg-muted/30 p-4 text-sm"><b>Exit criteria:</b> Verify every role's permitted and denied actions; one-stock-model online/POS conflicts; payment, returns and refunds; real customer tracking; delivery exceptions; mobile accessibility; and secure logging. Only signed-off workflows qualify for production promotion.</footer>
 </main>;
}
