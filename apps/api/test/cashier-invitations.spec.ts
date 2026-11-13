import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { hashPassword, tokenHash } from "../src/identity/crypto";

const origin = "http://localhost:3000";
const adminPassword = "UAT_Administrator_Password_2026!";
let app: INestApplication;
let db: Database;
let base: string;
let adminAuth: Record<string,string>;

type ApiReply = { status:number; payload:any; };
async function request(path:string, method="GET", body?:unknown,
  headers:Record<string,string>={}):Promise<ApiReply>{
  const response=await fetch(base+"/api/v1"+path,{
    method,headers:{...headers,...(body===undefined?{}:{"content-type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  let payload:any;
  try { payload=await response.json(); } catch { payload={}; }
  return {status:response.status,payload};
}
async function login(email:string,password:string){
  const r=await request("/auth/sessions","POST",{email,password,client:"native"});
  assert.equal(r.status,201,JSON.stringify(r.payload));
  return {authorization:"Bearer "+r.payload.data.accessToken};
}
async function invite(admin:Record<string,string>,email:string,locations=["loc_accra"]){
  return request("/admin/staff/invitations","POST",{
    name:"Synthetic Invited Cashier",email,phone:"",locationIds:locations,
  },admin);
}
async function accept(code:string,password="Cashier chooses own Password 2026!") {
  return request("/auth/staff-invitations/accept","POST",{code,password},{origin});
}
before(async()=>{
  const name=new URL(process.env.DATABASE_URL!).pathname.replace(/^\//,"");
  if(name!=="variety_foundation_test")
    throw Error("Cashier invitation tests require disposable foundation database");
  app=await createApplication(readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,
    WEB_ORIGINS:origin,
    API_STOCK_LOCATION_ID:"loc_accra",
    API_INSECURE_COOKIES:"true",
    STAFF_MANAGEMENT_ENABLED:"true",
  }));
  await app.listen(0,"127.0.0.1");
  base=await app.getUrl();
  db=app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "User", "Location", "LoginThrottle" CASCADE');
  await db.location.createMany({data:[
    {id:"loc_accra",name:"Accra synthetic",active:true},
    {id:"loc_kumasi",name:"Kumasi synthetic",active:true},
    {id:"loc_disabled",name:"Disabled location",active:false},
  ]});
  const passwordHash=await hashPassword(adminPassword);
  await db.user.createMany({data:[
    {id:"invitation-admin",name:"Test Admin",email:"invite-admin@example.test",
      phone:"",passwordHash,role:"admin",active:true},
    {id:"invitation-inventory",name:"Test Inventory",email:"invite-inventory@example.test",
      phone:"",passwordHash,role:"inventory_manager",active:true},
  ]});
  // Reuse one real administrator bearer session so the production login
  // throttle is never disabled or bypassed merely for test convenience.
  adminAuth = await login("invite-admin@example.test", adminPassword);
});
after(async()=>{await app?.close();});

test("only administrators can issue invitations, and direct password account creation is off",async()=>{
  const admin=adminAuth;
  const inventory=await login("invite-inventory@example.test",adminPassword);
  assert.equal((await invite(inventory,"blocked@example.test")).status,403);
  assert.equal((await invite({},"anonymous@example.test")).status,401);
  assert.equal((await request("/admin/staff","POST",{
    name:"Forbidden Direct Cashier",email:"direct@example.test",
    password:adminPassword,locationIds:["loc_accra"],
  },admin)).status,503);
  assert.equal((await invite(admin,"no-branch@example.test",["loc_disabled"])).status,400);
  assert.equal((await invite(admin,"bad-branch@example.test",["missing"])).status,400);
  assert.equal((await request("/admin/staff/invitations","POST",{
    name:"Attacker",email:"attacker@example.test",
    role:"admin",locationIds:["loc_accra"],
  },admin)).status,400);
  assert.equal(await db.user.count({where:{email:"direct@example.test"}}),0);
});

test("one-use cashier invitation stores only a digest and requires recipient's new password",async()=>{
  const admin=adminAuth;
  const invited=await invite(admin,"new-cashier@example.test");
  assert.equal(invited.status,201,JSON.stringify(invited.payload));
  const {code,cashier,expiresAt}=invited.payload.data;
  assert.match(code,/^[a-f0-9]{64}$/);
  assert.equal(cashier.active,false);
  assert.equal(cashier.role,"cashier");
  assert.equal(cashier.invitationStatus,"pending");
  assert.equal(cashier.invitationExpiresAt,expiresAt);
  const pendingList=await request("/admin/staff","GET",undefined,admin);
  assert.equal(pendingList.status,200);
  assert.equal(pendingList.payload.data.staff.find((x:{id:string})=>x.id===cashier.id).invitationStatus,"pending");
  assert.equal(JSON.stringify(pendingList.payload).includes(code),false);
  assert.ok(new Date(expiresAt).getTime()>Date.now());
  const record=await db.staffInvitation.findUniqueOrThrow({where:{userId:cashier.id}});
  assert.equal(record.tokenHash,tokenHash(code));
  assert.notEqual(record.tokenHash,code);
  assert.equal(record.acceptedAt,null);
  assert.equal((await request("/auth/sessions","POST",{
    email:"new-cashier@example.test",password:adminPassword,client:"native",
  })).status,401);
  assert.equal((await request("/admin/staff/"+cashier.id+"/actions","POST",{
    action:"set_active",active:true,
  },admin)).status,409);
  assert.equal((await request("/admin/staff/"+cashier.id+"/actions","POST",{
    action:"reset_password",password:adminPassword,
  },admin)).status,409);
  assert.equal((await request("/auth/staff-invitations/accept","POST",{
    code,password:"Cashier chooses own Password 2026!",
  },{"origin":"https://untrusted.example.test"})).status,403);
  assert.equal((await accept("0".repeat(64))).status,400);
  assert.equal((await accept(code,"short")).status,400);
  const accepted=await accept(code);
  assert.equal(accepted.status,201,JSON.stringify(accepted.payload));
  assert.deepEqual(accepted.payload.data,{activated:true});
  assert.equal((await accept(code)).status,400);
  const acceptedList=await request("/admin/staff","GET",undefined,admin);
  assert.equal(acceptedList.payload.data.staff.find((x:{id:string})=>x.id===cashier.id).invitationStatus,"accepted");
  const cashierAuth=await login("new-cashier@example.test","Cashier chooses own Password 2026!");
  assert.equal((await request("/auth/me","GET",undefined,cashierAuth)).status,200);
  assert.equal((await request("/admin/staff/invitations","POST",{
    name:"Fake Admin",email:"fake-admin@example.test",locationIds:["loc_accra"],
  },cashierAuth)).status,403);
  assert.equal((await invite(admin,"new-cashier@example.test")).status,409);
  const audits=await db.auditEvent.findMany({where:{entityId:cashier.id}});
  assert.equal(audits.filter(x=>x.action==="staff.cashier_invitation_issued").length,1);
  assert.equal(audits.filter(x=>x.action==="staff.cashier_invitation_accepted").length,1);
  assert.equal(JSON.stringify(audits).includes(code),false);
  assert.equal(JSON.stringify(audits).includes("Cashier chooses own Password 2026!"),false);
});

test("reissue invalidates an older unredeemed code and only latest one can activate",async()=>{
  const admin=adminAuth;
  const first=await invite(admin,"renewed-cashier@example.test");
  assert.equal(first.status,201);
  const original=first.payload.data.code as string;
  const second=await invite(admin,"renewed-cashier@example.test",["loc_kumasi"]);
  assert.equal(second.status,201,JSON.stringify(second.payload));
  assert.equal(second.payload.data.cashier.id,first.payload.data.cashier.id);
  assert.notEqual(second.payload.data.code,original);
  assert.deepEqual(second.payload.data.cashier.locationIds,["loc_kumasi"]);
  assert.equal((await accept(original)).status,400);
  assert.equal((await accept(second.payload.data.code)).status,201);
  const grant=await db.userLocation.findMany({
    where:{userId:second.payload.data.cashier.id},
  });
  assert.deepEqual(grant.map(x=>x.locationId),["loc_kumasi"]);
});

test("suspending a pending cashier revokes its invitation; administrator may reissue",async()=>{
  const admin=adminAuth;
  const sent=await invite(admin,"suspended-invite@example.test");
  assert.equal(sent.status,201);
  const userId=sent.payload.data.cashier.id;
  const stopped=await request(`/admin/staff/${userId}/actions`,"POST",{
    action:"set_active",active:false,
  },admin);
  assert.equal(stopped.status,201);
  assert.equal((await accept(sent.payload.data.code)).status,400);
  const newOne=await invite(admin,"suspended-invite@example.test");
  assert.equal(newOne.status,201);
  assert.notEqual(newOne.payload.data.code,sent.payload.data.code);
  assert.equal((await accept(newOne.payload.data.code)).status,201);
});

test("expired and inactive-location invitations cannot be used",async()=>{
  const admin=adminAuth;
  const exp=await invite(admin,"expired-cashier@example.test");
  assert.equal(exp.status,201);
  await db.staffInvitation.update({
    where:{userId:exp.payload.data.cashier.id},
    data:{expiresAt:new Date(Date.now()-60_000)},
  });
  assert.equal((await accept(exp.payload.data.code)).status,400);
  const expiredList=await request("/admin/staff","GET",undefined,admin);
  assert.equal(expiredList.payload.data.staff.find((x:{id:string})=>x.id===exp.payload.data.cashier.id).invitationStatus,"expired");
  const closed=await invite(admin,"closed-location-cashier@example.test");
  assert.equal(closed.status,201);
  await db.location.update({where:{id:"loc_accra"},data:{active:false}});
  const denied=await accept(closed.payload.data.code);
  assert.equal(denied.status,409);
  const user=await db.user.findUniqueOrThrow({where:{id:closed.payload.data.cashier.id}});
  assert.equal(user.active,false);
  const inviteRow=await db.staffInvitation.findUniqueOrThrow({
    where:{userId:closed.payload.data.cashier.id},
  });
  assert.equal(inviteRow.acceptedAt,null);
  await db.location.update({where:{id:"loc_accra"},data:{active:true}});
});

test("concurrent redemption is single-use without a second activation or audit",async()=>{
  const admin=adminAuth;
  const issued=await invite(admin,"concurrent-cashier@example.test");
  assert.equal(issued.status,201);
  const responses=await Promise.all([
    accept(issued.payload.data.code),
    accept(issued.payload.data.code),
  ]);
  assert.deepEqual(responses.map(x=>x.status).sort(),[201,400]);
  const audits=await db.auditEvent.count({
    where:{entityId:issued.payload.data.cashier.id,
      action:"staff.cashier_invitation_accepted"},
  });
  assert.equal(audits,1);
});
