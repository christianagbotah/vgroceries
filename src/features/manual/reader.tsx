"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowDown,ArrowLeft,ArrowRight,BookOpen,CheckCircle2,Download,
  ClipboardCheck,ExternalLink,FileText,Menu,Printer,Search,ShieldAlert,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {apiOps} from "@/services/client";
import {
  MANUAL_READINESS_LABELS,MANUAL_ROLE_LABELS,
  screenLink,screensForRole,type ManualRole,type ManualScreen,
} from "./catalogue";
import {workflowsForRole,type ManualWorkflow} from "./workflows";
import {downloadOfflineManual,printManualAsPdf} from "./export";
import {downloadManualUatCsv} from "./uat-evidence";
import {manualVisual} from "./visual-model";
import {ManualVisualShape} from "./visual-shape";

type FocusRole=ManualRole|"all";
const allRoles:ManualRole[]=["admin","inventory_manager","cashier","rider","customer"];
const isManualRole=(value:string):value is ManualRole=>allRoles.some(r=>r===value);
const matches=(source:string,query:string)=>source.toLocaleLowerCase("en").includes(query);
const navigationText=(screen:ManualScreen)=>screen.path.includes("[")
  ?"Open the parent list, then select the correct record.":"Open this route if authorized in your environment.";

function ScreenSchematic({screen}:{screen:ManualScreen}){
  return <figure className="overflow-hidden rounded-2xl border bg-white shadow-sm">
    <div className="flex items-center gap-2 bg-[#143e2c] px-4 py-3 text-white">
      <div className="flex gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-[#edce82]"/><span className="size-2 rounded-full bg-[#659781]"/><span className="size-2 rounded-full bg-white/60"/></div>
      <span className="ml-2 truncate text-xs font-semibold">VARIETY GROCERIES · {screen.section}</span>
    </div>
    <div className="grid min-h-[245px] grid-cols-[100px_minmax(0,1fr)] sm:grid-cols-[155px_minmax(0,1fr)]">
      <div className="space-y-3 border-r bg-[#f0f4ef] px-3 py-5 text-[11px] text-[#42634b]">
        <p className="font-bold">① MENU</p>
        <div className="h-2 w-3/4 rounded-full bg-[#bdd6c4]"/>
        <p className="rounded-md bg-[#d9eadc] p-2 font-semibold">{screen.section}</p>
        <div className="h-2 w-full rounded-full bg-[#d2e1d4]"/>
        <div className="h-2 w-2/3 rounded-full bg-[#d2e1d4]"/>
      </div>
      <div className="min-w-0 space-y-3 p-3 sm:p-5">
        <p className="text-xs font-bold text-[#21563a]">② {screen.title}</p>
        <div className="rounded-lg border bg-[#f7faf7] p-3 text-xs leading-5 text-[#415646]">
          {screen.purpose}
        </div>
        <ManualVisualShape visual={manualVisual(screen)}/>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="rounded-lg border border-[#d5e6d7] bg-white p-3 text-xs leading-5 text-[#3a5b45]">
            <span className="font-bold text-[#155b3c]">③ Key activity</span>
            <p className="mt-1">{screen.action}</p>
          </div>
          <div className="flex items-center justify-center rounded-lg bg-[#dcb66b]/25 px-3 py-2 text-xs font-semibold text-[#614b23]">Review evidence</div>
        </div>
        <div className="border-l-4 border-[#ba9a5a] bg-[#fdf8e9] px-3 py-2 text-xs leading-5 text-[#6a583b]">
          ④ {screen.check}
        </div>
      </div>
    </div>
    <figcaption className="border-t px-4 py-2 text-[11px] leading-5 text-muted-foreground">
      Annotated training schematic, not a screenshot. Actual controls and data must be checked during authenticated role-by-role UAT.
    </figcaption>
  </figure>;
}

function WorkflowVisual({workflow}:{workflow:ManualWorkflow}){
  return <div className="space-y-4">
    <div className="rounded-xl border bg-card p-4 text-sm leading-6">{workflow.summary}</div>
    <ol className="flex flex-wrap items-stretch gap-2" aria-label={workflow.title+" workflow stages"}>
      {workflow.stages.map((stage,i)=><li key={stage} className="flex min-w-0 items-stretch gap-2">
        <div className="flex min-h-24 w-[180px] max-w-[calc(100vw-110px)] flex-col justify-center gap-2 rounded-xl border border-[#bfd7c7] bg-[#eef7f0] p-3 text-xs text-[#164b36]">
          <span className="flex size-7 items-center justify-center rounded-full bg-[#18543b] font-bold text-white">{i+1}</span>
          <strong className="leading-5">{stage}</strong>
        </div>
        {i<workflow.stages.length-1?<ArrowRight className="my-auto size-4 shrink-0 text-[#8b9f8e]" aria-hidden="true"/>:null}
      </li>)}
    </ol>
    <div className="rounded-xl border-l-4 border-[#bc9855] bg-[#fff6e0] p-4 text-sm leading-6 text-[#51421e]">
      <strong>Critical control:</strong> {workflow.gate}
    </div>
    <div className="rounded-xl border p-4 text-sm leading-6"><strong>After this stage:</strong> {workflow.whatNext}</div>
  </div>;
}

function ScreenDetails({screen,index,total}:{screen:ManualScreen;index:number;total:number}){
  const route=screenLink(screen.path);
  return <article id="manual-screen-detail" className="space-y-5" aria-live="polite">
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>SCREEN {index+1} OF {total}</span>
      <span aria-hidden="true">•</span><span>{screen.section}</span>
    </div>
    <div className="space-y-2">
      <h2 className="font-serif text-2xl font-bold sm:text-3xl">{screen.title}</h2>
      <p className="break-all font-mono text-xs text-muted-foreground">{screen.path}</p>
      <span className="inline-flex max-w-full rounded-full border bg-muted px-3 py-1 text-xs font-semibold">
        {MANUAL_READINESS_LABELS[screen.readiness]}
      </span>
    </div>
    <ScreenSchematic screen={screen}/>
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><BookOpen className="size-4"/>How to use this screen</h3>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
          <li><strong>Locate:</strong> {navigationText(screen)}</li>
          <li><strong>Purpose:</strong> {screen.purpose}</li>
          <li><strong>Action:</strong> {screen.action}</li>
          <li><strong>Verify:</strong> {screen.check}</li>
        </ol>
      </section>
      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><ShieldAlert className="size-4"/>Controls and release status</h3>
        <p className="text-sm leading-6">{screen.check}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The presence of a page does not confirm its backend writer, provider or business process is approved for real transactions.
        </p>
        <Link href={route}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-primary hover:bg-accent">
          {screen.path.includes("[")?"Open parent list":"Open screen"}
          <ExternalLink className="size-4" aria-hidden="true"/>
        </Link>
      </section>
    </div>
  </article>;
}

export function ManualReader({guestScope="customer"}:{guestScope?:"customer"|"rider"}={}){
  const [role,setRole]=useState<ManualRole>("customer");
  const [authenticated,setAuthenticated]=useState(false);
  const [checking,setChecking]=useState(true);
  const [focus,setFocus]=useState<FocusRole>("all");
  const [view,setView]=useState<"screens"|"workflows">("screens");
  const [search,setSearch]=useState("");
  const [selectedPath,setSelectedPath]=useState<string>("");
  const [selectedFlow,setSelectedFlow]=useState<string>("");
  const [mobileNav,setMobileNav]=useState(false);
  const [printError,setPrintError]=useState("");
  useEffect(()=>{
    let active=true;
    let attempt=0;
    const verify=()=>{
      const current=++attempt;
      // Hide any prior admin/staff chapter immediately until the current
      // authenticated session has been rechecked; never trust cached roles.
      setChecking(true);setRole(guestScope);setAuthenticated(false);
      void apiOps.accountSession().then(session=>{
        if(!active||current!==attempt)return;
        const real=session.actor.role;
        if(!isManualRole(real))throw new Error("Unrecognized manual role");
        setRole(real);setAuthenticated(true);
      }).catch(()=>{
        if(!active||current!==attempt)return;
        // Unauthenticated browser visitors get public customer or rider
        // training only. A route is never a replacement for permission.
        setRole(guestScope);setAuthenticated(false);
      }).finally(()=>{if(active&&current===attempt)setChecking(false);});
    };
    verify();
    const onVisible=()=>{if(document.visibilityState==="visible")verify();};
    window.addEventListener("focus",verify);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{
      active=false;
      window.removeEventListener("focus",verify);
      document.removeEventListener("visibilitychange",onVisible);
    };
  },[guestScope]);
  const effectiveRole:ManualRole=role==="admin"&&focus!=="all"?focus:role;
  const screens=useMemo(()=>screensForRole(effectiveRole),[effectiveRole]);
  const workflows=useMemo(()=>workflowsForRole(effectiveRole),[effectiveRole]);
  const needle=search.trim().toLocaleLowerCase("en");
  const filteredScreens=useMemo(()=>screens.filter(s=>!needle||
    [s.title,s.path,s.section,s.purpose,s.action,s.check].some(v=>matches(v,needle))),[screens,needle]);
  const filteredFlows=useMemo(()=>workflows.filter(f=>!needle||
    [f.title,f.summary,...f.stages,f.gate].some(v=>matches(v,needle))),[workflows,needle]);
  const screen=filteredScreens.find(s=>s.path===selectedPath)??filteredScreens[0];
  const flow=filteredFlows.find(f=>f.id===selectedFlow)??filteredFlows[0];
  const screenIndex=screen?filteredScreens.indexOf(screen):-1;
  const grouped=useMemo(()=>{
    const groups=new Map<string,ManualScreen[]>();
    for(const s of filteredScreens)groups.set(s.section,[...(groups.get(s.section)??[]),s]);
    return [...groups.entries()];
  },[filteredScreens]);
  const showGuide=()=>window.requestAnimationFrame(()=>
    document.getElementById("manual-content")?.scrollIntoView({behavior:"smooth",block:"start"}));
  const chooseScreen=(path:string)=>{setSelectedPath(path);setMobileNav(false);showGuide();};
  const chooseFlow=(id:string)=>{setSelectedFlow(id);setMobileNav(false);showGuide();};
  const rolesToView=role==="admin"
    ? ["all","customer","inventory_manager","cashier","rider"] as FocusRole[]
    : [];
  const backToPortal=authenticated
    ?role==="admin"?"/admin":role==="inventory_manager"?"/admin/inventory":
      role==="cashier"?"/staff/cashier/workspace":role==="rider"?"/staff/rider/cod":"/account"
    :guestScope==="rider"?"/rider":"/account";
  const print=()=>setPrintError(printManualAsPdf(effectiveRole,screens,workflows)
    ?"":"Allow pop-ups for this page, then choose Print / Save PDF again.");
  return <div className="min-h-screen bg-[#f6f8f4] text-foreground">
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-17 max-w-[1480px] flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <Image src="/brand/variety-mark.svg" alt="" width={40} height={44} className="h-9 w-9 object-contain"/>
          <span className="min-w-0"><strong className="block font-serif text-sm sm:text-base">Variety Groceries</strong>
          <span className="block text-[11px] text-muted-foreground">System guide & workflow atlas</span></span>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="min-h-10" onClick={()=>downloadOfflineManual(effectiveRole,screens,workflows)} disabled={checking}>
            <Download className="size-4"/> Download manual
          </Button>
          <Button size="sm" className="min-h-10" onClick={print} disabled={checking}>
            <Printer className="size-4"/> Print / Save PDF
          </Button>
          {role==="admin"&&authenticated&&!checking?<Button variant="outline" size="sm" className="min-h-10" onClick={()=>downloadManualUatCsv("admin",screensForRole("admin"))}>
            <ClipboardCheck className="size-4"/> Screenshot UAT checklist
          </Button>:null}
          <Button variant="outline" size="sm" className="min-h-10 lg:hidden" onClick={()=>setMobileNav(x=>!x)} aria-expanded={mobileNav} aria-controls="manual-navigation">
            <Menu className="size-4"/> Chapters
          </Button>
        </div>
      </div>
    </header>
    <div className="mx-auto max-w-[1480px] px-3 py-6 sm:px-6">
      <Link href={backToPortal} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#225b3f] hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true"/> Return to {authenticated?role==="customer"?"my account":"my workspace":"the portal"}
      </Link>
      <div className="mb-5 overflow-hidden rounded-2xl bg-[#133f2d] p-5 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#e6c67c]">VG · Training and operations</p>
        <h1 className="mt-2 max-w-4xl font-serif text-3xl font-bold leading-tight sm:text-4xl">Every screen. Every handoff. The right instructions for your role.</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/85">
          Explore {screens.length} documented screens and {workflows.length} workflow diagrams, with annotated visual maps, key tasks and safety checks.
          This manual describes source screens; it does not authorize disabled modules, real money or inventory changes.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-white/30 px-3 py-1.5">{checking?"Checking account…":authenticated?MANUAL_ROLE_LABELS[role]:guestScope==="rider"?"Guest · rider demo guide":"Guest · customer guide"}</span>
          <span className="rounded-full border border-white/30 px-3 py-1.5">20 Nov 2026 edition</span>
          <span className="rounded-full border border-white/30 px-3 py-1.5">UAT and production gates marked</span>
        </div>
      </div>
      {role==="admin"&&authenticated&&!checking?<p className="mb-4 rounded-xl border border-[#c3dfcb] bg-[#f0f7f0] p-4 text-sm leading-6">
        <strong>Administrator screenshot acceptance:</strong> Use “Screenshot UAT checklist” above to download the full 79-screen evidence template. Every desktop, mobile, functionality and role check begins <strong>NOT_TESTED</strong>. Fill in the deployed source SHA, redacted screenshot evidence, reviewer and UTC approval only after checking the actual staging screen. Nothing is auto-approved by the manual.
      </p>:null}
      <details className="mb-5 rounded-xl border bg-white p-4 text-sm leading-6">
        <summary className="cursor-pointer font-bold text-[#1c563b]">Role access: real accounts versus specialist demo roles</summary>
        <p className="mt-3">The authenticated backend currently recognizes <strong>administrator, inventory manager, cashier, rider and customer</strong>. The guide selects this real role using the server-verified session. Administrators may read every role’s guide.</p>
        <p className="mt-2">The design/demo menu also describes owner/admin, operations manager, inventory officer, picker/packer, dispatcher and finance/refund reviewer. Those specialist design roles are <strong>not independent production login grants</strong> until their server-side authority and branch boundaries are implemented and accepted.</p>
        <p className="mt-2 text-muted-foreground">Seeing a guide, role label or menu never authorizes a payment, refund, stock adjustment, customer disclosure or shipment action.</p>
      </details>
      {printError?<p role="alert" className="mb-4 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{printError}</p>:null}
      <div className="mb-5 flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        <div className="min-w-[210px] flex-1">
          <label htmlFor="manual-search" className="mb-1.5 block text-xs font-bold">Search screens and workflows</label>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"/>
            <Input id="manual-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="e.g. refund, goods receiving, COD, receipts…" className="min-h-11 pl-9"/>
          </div>
        </div>
        {role==="admin"&&!checking?<div className="min-w-[190px]">
          <label htmlFor="manual-focus" className="mb-1.5 block text-xs font-bold">Administrator: role view</label>
          <select id="manual-focus" value={focus} onChange={e=>setFocus(e.target.value as FocusRole)} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm">
            {rolesToView.map(value=><option key={value} value={value}>{value==="all"?"All roles":MANUAL_ROLE_LABELS[value]}</option>)}
          </select>
        </div>:null}
        <div className="self-end text-xs text-muted-foreground">
          {filteredScreens.length} screens · {filteredFlows.length} workflows
        </div>
      </div>
      <p className="mb-5 rounded-xl border border-[#d9c395] bg-[#fff9ed] p-3 text-xs leading-5 text-[#5f512f]">
        <strong>Important:</strong> A manual screen map is not a screenshot or a guarantee the feature is switched on. Payment status requires provider proof; stock, refunds and COD must pass their independent backend gates. The complete offline HTML download contains all chapters permitted to the current account; Print / Save PDF opens the same role-scoped complete edition.
      </p>
      <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside id="manual-navigation" className={`rounded-xl border bg-card p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto ${mobileNav?"":"hidden lg:block"}`}>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant={view==="screens"?"default":"outline"} onClick={()=>setView("screens")}><FileText className="size-4"/> Screens</Button>
            <Button size="sm" variant={view==="workflows"?"default":"outline"} onClick={()=>setView("workflows")}><BookOpen className="size-4"/> Flows</Button>
          </div>
          <nav aria-label="User manual chapters" className="mt-4 space-y-4">
            {view==="screens"?grouped.map(([section,items])=><div key={section}>
              <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{section}</p>
              {items.map(s=><button type="button" key={s.path} onClick={()=>chooseScreen(s.path)}
                aria-current={s.path===screen?.path?"page":undefined}
                className={`mb-1 block w-full rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-muted ${s.path===screen?.path?"bg-[#e4efe5] font-semibold text-[#185439]":""}`}>
                <span className="block">{s.title}</span>
                <span className="block truncate font-mono text-[10px] font-normal text-muted-foreground">{s.path}</span>
              </button>)}
            </div>):filteredFlows.map(f=><button type="button" key={f.id} onClick={()=>chooseFlow(f.id)}
              aria-current={f.id===flow?.id?"page":undefined}
              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted ${f.id===flow?.id?"bg-[#e4efe5] font-semibold text-[#185439]":""}`}>{f.title}</button>)}
          </nav>
        </aside>
        <main id="manual-content" className="min-w-0 scroll-mt-24 rounded-xl border bg-card p-4 sm:p-7">
          {view==="screens"&&screen?<ScreenDetails screen={screen} index={screenIndex} total={filteredScreens.length}/>:null}
          {view==="workflows"&&flow?<section className="space-y-5">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">WORKFLOW · {filteredFlows.indexOf(flow)+1} OF {filteredFlows.length}</p>
              <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">{flow.title}</h2></div>
            <WorkflowVisual workflow={flow}/>
          </section>:null}
          {(view==="screens"&&!screen||view==="workflows"&&!flow)?<p role="status" className="rounded-xl border p-5 text-sm">No matching chapters. Change the search phrase to explore more screens.</p>:null}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <Button variant="outline" className="min-h-11" disabled={view==="screens"?screenIndex<=0:!flow||filteredFlows.indexOf(flow)<=0}
              onClick={()=>{
                if(view==="screens"&&screenIndex>0)chooseScreen(filteredScreens[screenIndex-1]!.path);
                else if(view==="workflows"&&flow)chooseFlow(filteredFlows[filteredFlows.indexOf(flow)-1]!.id);
              }}><ArrowLeft className="size-4"/> Previous</Button>
            <p className="text-xs text-muted-foreground">Select a chapter at left for full navigation</p>
            <Button variant="outline" className="min-h-11" disabled={view==="screens"?screenIndex<0||screenIndex===filteredScreens.length-1:!flow||filteredFlows.indexOf(flow)===filteredFlows.length-1}
              onClick={()=>{
                if(view==="screens"&&screenIndex>=0&&screenIndex<filteredScreens.length-1)chooseScreen(filteredScreens[screenIndex+1]!.path);
                else if(view==="workflows"&&flow&&filteredFlows.indexOf(flow)<filteredFlows.length-1)chooseFlow(filteredFlows[filteredFlows.indexOf(flow)+1]!.id);
              }}>Next <ArrowRight className="size-4"/></Button>
          </div>
        </main>
      </div>
      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t py-6 text-xs text-muted-foreground">
        <p className="flex items-center gap-2"><CheckCircle2 className="size-4" aria-hidden="true"/> System documentation for reviewed source routes, not certification of live features.</p>
        <Link href="/help" className="inline-flex min-h-10 items-center gap-2 text-primary hover:underline">General help <ArrowDown className="size-4"/></Link>
      </footer>
    </div>
  </div>;
}
