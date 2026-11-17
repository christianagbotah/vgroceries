import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,rename,open} from 'node:fs/promises';
import {join} from 'node:path';

const DATA='/home/lightworld/data/varietygroceries/hubtel-owner-pilot';
const SETTINGS='/home/lightworld/config/varietygroceries/api.env';
const ROOT='https://portal.varietygroceries.com/hubtel-owner-pilot';
const INIT_URL='https://payproxyapi.hubtel.com/items/initiate';
const AMOUNT=1.00;
const AMOUNT_MINOR=100;
const expMs=24*3600*1000;
const tokenRx=/^[0-9a-f]{48}$/;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function filename(token){if(!tokenRx.test(token))throw Error('invalid token');return join(DATA,createHash('sha256').update(token).digest('hex')+'.json');}
async function readOne(token){try{return JSON.parse(await readFile(filename(token),'utf8'))}catch{return null}}
async function persist(token,value){
 const path=filename(token), temp=path+'.'+randomBytes(5).toString('hex')+'.tmp';
 const f=await open(temp,'wx',0o600);
 try{await f.writeFile(JSON.stringify(value)+'\n');}finally{await f.close()}
 await rename(temp,path);
}
function response(res,status,body,type='text/plain; charset=utf-8'){
 res.writeHead(status,{'content-type':type,'cache-control':'no-store, max-age=0','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'","x-robots-tag":"noindex, nofollow, noarchive"});
 res.end(body);
}
function template(row,returned){
 const created=new Date(row.createdAt), valid=Date.now()-created.getTime()<expMs;
 const hasLink=valid && !!row.checkoutUrl;
 const callback=row.callback;
 const state=callback ? 'Callback received — NOT independently verified' : 'Awaiting payment evidence';
 const note=callback ? ('Reported by callback: '+esc(callback.providerStatus||'unknown')+'. The Hubtel status API is currently blocked (HTTP 403); check the merchant account before recording payment.') : 'A Hubtel checkout link only means the payment screen opened; it does not mean money was received.';
 const caution=returned==='returned'?'You returned from Hubtel. That redirect is NOT proof of payment.':returned==='cancelled'?'Checkout was cancelled in your browser; callback/status are still the payment authority.':'Only the owner should use this pilot link.';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="20"><title>Variety Groceries • Hubtel ₵1 Owner Test</title></head><body style="background:#f6f7f3;margin:0;font:16px system-ui,sans-serif;color:#173422"><main style="max-width:560px;margin:6vh auto;padding:26px 24px;background:white;border:1px solid #cdd8cf;border-radius:18px;box-shadow:0 8px 30px #13331c14"><div style="color:#a67b16;font-weight:800;letter-spacing:.09em">VG · VARIETY GROCERIES</div><h1 style="font-size:27px;margin:18px 0 6px">Hubtel owner-only payment test</h1><p style="color:#647368;margin:0 0 18px">This is NOT a grocery order. It cannot affect stock, fulfilment or customer balances.</p><p style="font-size:31px;font-weight:850;margin:5px 0 16px">₵1.00</p><div style="background:#fff8e2;padding:12px;border-radius:9px;font-weight:600">'+esc(caution)+'</div><h2 style="font-size:18px;margin-top:25px">'+esc(state)+'</h2><p>'+note+'</p><p style="overflow-wrap:anywhere;font-size:13px"><b>Test reference:</b> '+esc(row.reference)+'</p>'+(hasLink?'<p style="margin:24px 0"><a href="'+esc(row.checkoutUrl)+'" rel="noreferrer noopener" style="display:block;background:#144e32;border-radius:9px;color:white;padding:15px;text-align:center;font-weight:750;text-decoration:none">Open Hubtel ₵1 checkout</a></p>':'<p style="color:#8a331b">This link has expired or the checkout was not created.</p>')+'<p style="font-size:13px;color:#647368">Approve the payment only if you intend to send ₵1.00 from your own wallet. For real payment confirmation, review the transaction against this reference in your Hubtel merchant dashboard. Page refreshes every 20 seconds.</p><p style="font-size:13px"><a href="https://portal.varietygroceries.com/" rel="noreferrer" style="color:#14643b">Return to Variety Groceries staging</a></p></main></body></html>';
}
async function parseBody(req){
 const chunks=[];let size=0;for await (const chunk of req){size+=chunk.length;if(size>65536)throw Error('body too large');chunks.push(chunk)}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function create(){
 const raw=await readFile(SETTINGS,'utf8');
 const env={};for(const line of raw.split(/\r?\n/)){if(/^\s*#/.test(line)||!line.includes('='))continue;const i=line.indexOf('=');env[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}
 const id=env.HUBTEL_SALES_API_ID, key=env.HUBTEL_SALES_API_KEY, account=env.HUBTEL_COLLECTION_ACCOUNT_NUMBER;
 if(!id||!key||!/^\d{3,32}$/.test(account??''))throw Error('Merchant credential/account configuration invalid');
 const token=randomBytes(24).toString('hex'),reference='VG-LIVE-'+randomBytes(10).toString('hex').toUpperCase();
 const doc={reference,amountMinor:AMOUNT_MINOR,createdAt:new Date().toISOString(),status:'initiation_unknown',checkoutUrl:null,callback:null};
 await persist(token,doc);
 const payload={
  totalAmount:AMOUNT,description:'Variety Groceries Owner Checkout Test',
  callbackUrl:ROOT+'/callback/'+token,
  returnUrl:ROOT+'/'+token+'?returned=1',
  cancellationUrl:ROOT+'/'+token+'?cancelled=1',
  merchantAccountNumber:account,clientReference:reference
 };
 let res,body;
 try{
  res=await fetch(INIT_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':'Basic '+Buffer.from(id+':'+key).toString('base64')},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});
  body=await res.json();
 }catch(err){console.log('HUBTEL_INITIATION_UNCERTAIN: do not retry same reference automatically');process.exitCode=2;return}
 if(!res.ok||body?.responseCode!=='0000'||body?.status!=='Success'||body?.data?.clientReference!==reference||!body?.data?.checkoutUrl){
  console.log('HUBTEL_INITIATION_NOT_CONFIRMED HTTP',res.status,'CODE',typeof body?.responseCode==='string'?body.responseCode:'N/A');
  process.exitCode=2;return;
 }
 const uri=new URL(body.data.checkoutUrl);
 if(uri.protocol!=='https:'||uri.hostname!=='pay.hubtel.com'||uri.username||uri.password||uri.port)throw Error('Unsafe Hubtel checkout destination; do not proceed');
 doc.checkoutUrl=uri.toString();doc.status='checkout_created_not_paid';doc.checkoutId=typeof body.data.checkoutId==='string'?body.data.checkoutId:null;await persist(token,doc);
 console.log('HUBTEL_OWNER_TEST_CHECKOUT_CREATED_NOT_PAID');
 console.log('AMOUNT: ₵1.00');
 console.log('OWNER_TEST_PAGE: '+ROOT+'/'+token);
 console.log('MERCHANT_REFERENCE: '+reference);
 console.log('IMPORTANT: checkout creation is not payment, and status API currently responds HTTP 403');
}
async function server(){
 http.createServer(async(req,res)=>{
  const path=new URL(req.url??'/', 'http://localhost').pathname;
  if(path==='/health'){response(res,200,'ok');return}
  if(req.method==='GET'){
   const m=path.match(/^\/([a-f0-9]{48})$/);
   if(!m){response(res,404,'Not found');return}
   const row=await readOne(m[1]);
   if(!row){response(res,404,'Not found');return}
   const url=new URL(req.url,'http://localhost');
   response(res,200,template(row,url.searchParams.has('returned')?'returned':url.searchParams.has('cancelled')?'cancelled':''),'text/html; charset=utf-8');
   return;
  }
  if(req.method==='POST'){
   const m=path.match(/^\/callback\/([a-f0-9]{48})$/);
   if(!m){response(res,404,'Not found');return}
   const row=await readOne(m[1]);if(!row){response(res,404,'Unknown pilot');return}
   let payload;try{payload=await parseBody(req)}catch{response(res,400,'Invalid JSON');return}
   const data=payload?.Data??payload?.data??{};
   const ref=data?.ClientReference??data?.clientReference;
   if(ref!==row.reference){response(res,400,'Unknown reference');return}
   const major=Number(data?.Amount??data?.amount);
   const amountMatches=Number.isFinite(major)&&Math.abs(major*100-row.amountMinor)<0.001;
   const status=String(payload?.Status??payload?.status??data?.Status??data?.status??'not reported').slice(0,35);
   row.callback={receivedAt:new Date().toISOString(),providerStatus:status,responseCode:String(payload?.ResponseCode??payload?.responseCode??'').slice(0,20),amountMatches,source:'UNVERIFIED_CALLBACK'};
   await persist(m[1],row);
   console.log('HUBTEL_TEST_CALLBACK',row.reference,'amountMatches='+amountMatches,'status='+status,'UNVERIFIED');
   response(res,200,JSON.stringify({received:true,paymentVerified:false}), 'application/json; charset=utf-8');return;
  }
  response(res,405,'Method not allowed');
 }).listen(3097,'127.0.0.1',()=>console.log('VG_HUBTEL_OWNER_PILOT_LOCAL_SERVICE_READY_NO_KEYS'));
}
if(process.argv[2]==='create')await create();else if(process.argv[2]==='serve')await server();else throw Error('Usage: node server.mjs create|serve');

[executed on device: vps.lightworldtech.com (87b1436c-4e75-4ad1-9d6f-9f944f444a60)]
