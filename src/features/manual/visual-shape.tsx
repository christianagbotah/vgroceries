import type {ManualVisual} from "./visual-model";

function Tile({name,index}:{name:string;index:number}){
  return <div className="min-w-0 rounded-lg border border-[#caddd0] bg-white p-2.5 text-[11px] text-[#2e5c42]">
    <span className="mb-1 inline-flex size-5 items-center justify-center rounded-full bg-[#dcece0] font-bold">{index+1}</span>
    <span className="ml-1 break-words font-medium leading-4">{name}</span>
  </div>;
}
export function ManualVisualShape({visual}:{visual:ManualVisual}){
  const x=visual.elements;
  switch(visual.kind){
    case "catalogue": return <div aria-label={visual.heading} className="space-y-2 rounded-xl border bg-[#f5faf5] p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#24573d]">{visual.heading}</p>
      <div className="rounded-md border border-[#cddccd] bg-white px-3 py-2 text-[11px] text-[#607a67]">⌕ {x[0]}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{x.map((label,i)=><div key={label} className="overflow-hidden rounded-lg border bg-white">
        <div className="flex h-10 items-center justify-center bg-[#e8efdf] text-[10px] text-[#5b7158]">Visual {i+1}</div>
        <div className="p-2 text-[10px] font-medium leading-4">{label}</div>
      </div>)}</div>
    </div>;
    case "checkout": return <div aria-label={visual.heading} className="space-y-2 rounded-xl border bg-[#f4f9f5] p-3">
      <p className="text-[11px] font-bold text-[#24573d]">{visual.heading}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{x.map((label,i)=><div key={label} className="rounded-lg border border-[#c2d9c7] bg-white p-2 text-[11px]">
        <span className="block font-bold text-[#1d6343]">STEP {i+1}</span><span className="leading-5">{label}</span>
      </div>)}</div>
      <div className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">Await authoritative verification before confirming payment.</div>
    </div>;
    case "ledger": return <div aria-label={visual.heading} className="space-y-2 rounded-xl border bg-[#f5faf6] p-3">
      <p className="text-[11px] font-bold text-[#24573d]">{visual.heading}</p>
      <div className="flex gap-2"><span className="flex-1 rounded-md border bg-white px-2 py-1.5 text-[11px]">⌕ {x[0]}</span><span className="rounded-md border bg-white px-2 py-1.5 text-[11px]">Filter</span></div>
      <div className="overflow-hidden rounded-md border bg-white">
        <div className="grid grid-cols-3 gap-2 bg-[#e7efe8] p-2 text-[10px] font-bold"><span>Record</span><span>Status</span><span>Action</span></div>
        {x.slice(1).map((label,i)=><div key={label} className="grid grid-cols-3 gap-2 border-t p-2 text-[10px]"><span className="font-medium">Row {i+1}</span><span>Review</span><span className="text-[#256c48]">{label}</span></div>)}
      </div>
    </div>;
    case "form":return <div aria-label={visual.heading} className="space-y-2 rounded-xl border bg-[#f5faf6] p-3">
      <p className="text-[11px] font-bold text-[#24573d]">{visual.heading}</p>
      <div className="grid grid-cols-2 gap-2">{x.slice(0,2).map((label,i)=><div key={label} className="rounded-lg border bg-white p-2 text-[10px]">
        <label className="mb-1 block font-semibold">{i+1}. {label}</label><div className="h-5 rounded border bg-[#f5f8f4]"/>
      </div>)}</div>
      <div className="flex flex-wrap gap-2">{x.slice(2).map((label,i)=><div key={label} className={"rounded-md px-3 py-1.5 text-[11px] font-medium "+(i===1?"bg-[#20583f] text-white":"border bg-white")}>{label}</div>)}</div>
    </div>;
    case "dashboard":return <div aria-label={visual.heading} className="space-y-2 rounded-xl border bg-[#f5faf6] p-3">
      <p className="text-[11px] font-bold text-[#24573d]">{visual.heading}</p>
      <div className="grid grid-cols-2 gap-2">{x.map((label,i)=><div key={label} className="rounded-lg border bg-white p-3">
        <p className="text-[10px] text-[#5f7467]">{label}</p><div className="mt-2 flex items-end gap-1" aria-hidden="true">{[5,8,6,11,7].map((height,j)=><div key={j} className="w-2 rounded-t-sm bg-[#bed9c0]" style={{height:height*(i%2?2:1.5)}}/>)}</div>
      </div>)}</div><p className="text-[10px] text-muted-foreground">Illustrative panels — no live totals shown</p>
    </div>;
    case "timeline":return <div aria-label={visual.heading} className="rounded-xl border bg-[#f5faf6] p-3">
      <p className="mb-2 text-[11px] font-bold text-[#24573d]">{visual.heading}</p>
      <ol className="space-y-1">{x.map((label,i)=><li key={label} className="flex items-center gap-2 text-[11px]">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[#5b9870] bg-white font-bold text-[#1e6441]">{i+1}</span>
        <div className="flex-1 rounded-md border bg-white px-3 py-1.5">{label}</div>
      </li>)}</ol>
    </div>;
    case "cash":return <div aria-label={visual.heading} className="space-y-2 rounded-xl border bg-[#f5faf6] p-3">
      <p className="text-[11px] font-bold text-[#24573d]">{visual.heading}</p>
      <div className="grid gap-2 sm:grid-cols-2">{x.map((label,i)=><div key={label} className="rounded-lg border bg-white p-2">
        <span className="block text-[10px] font-semibold text-[#5b7465]">{i+1}. {label}</span><span className="mt-1 block text-[11px] font-bold text-[#215741]">{i===1?"Evidence required":"Verification pending"}</span>
      </div>)}</div>
      <div className="rounded-md border-l-4 border-[#c8a56c] bg-[#fff8ed] px-2 py-1.5 text-[11px]">No unverified settlement assertions</div>
    </div>;
    case "rider":return <div aria-label={visual.heading} className="flex justify-center rounded-xl border bg-[#edf5ed] p-3">
      <div className="w-full max-w-[210px] rounded-[20px] border-4 border-[#254f38] bg-white p-3 shadow-sm">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#b9d2c1]"/>
        <p className="mb-2 rounded-md bg-[#275b42] p-2 text-[10px] font-bold text-white">{visual.heading}</p>
        {x.map((label,i)=><div key={label} className="mb-1.5 rounded-lg border bg-[#f8fbf8] p-2 text-[10px]"><strong>{i+1}.</strong> {label}</div>)}
      </div>
    </div>;
    case "guide":return <div aria-label={visual.heading} className="space-y-2 rounded-xl border bg-[#f5faf6] p-3">
      <p className="text-[11px] font-bold text-[#24573d]">{visual.heading}</p>
      {x.map((label,i)=><div key={label} className="flex justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-[11px]"><span>{i+1}. {label}</span><strong className="text-[#548665]">+</strong></div>)}
    </div>;
  }
}
