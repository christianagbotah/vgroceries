import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { hashPassword } from "../src/identity/crypto";
import { productionOpenApi } from "../src/http/production-openapi";

let app: INestApplication;
let db: Database;
let base: string;
const password = "Administrator_Test_Cashier_2026!";
const nextPassword = "Replacement_Cashier_Password_2026!";
const origin = "http://localhost:3000";

async function request(path: string, method = "GET", body?: unknown, headers: Record<string,string> = {}) {
  const response = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

async function webSession(email: string, secret = password) {
  const response = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({email,password:secret,client:"web"}),
  });
  const json = await response.json();
  assert.equal(response.status, 201, JSON.stringify(json));
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    origin,
    "x-csrf-token": json.data.csrfToken,
  };
}
before(async()=>{
  const databaseName = new URL(process.env.DATABASE_URL!).pathname.replace(/^\//, "");
  if(databaseName !== "variety_foundation_test")
    throw Error("Real staff tests may run only against the disposable foundation test database");
  app = await createApplication(readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,
    WEB_ORIGINS:origin,
    API_STOCK_LOCATION_ID:"loc_accra",
    API_INSECURE_COOKIES:"true",
    STAFF_MANAGEMENT_ENABLED:"true",
    STAFF_DIRECT_CASHIER_CREATE_ENABLED:"true",
  }));
  await app.listen(0,"127.0.0.1");
  base=await app.getUrl();
  db=app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "User", "Location", "LoginThrottle" CASCADE');
  const pw=await hashPassword(password);
  await db.location.createMany({data:[
    {id:"loc_accra",name:"Accra Test Branch",active:true},
    {id:"loc_kumasi",name:"Kumasi Test Branch",active:true},
    {id:"loc_disabled",name:"Disabled Test Branch",active:false},
  ]});
  await db.user.createMany({data:[
    {id:"staff-admin-test",name:"Administrator",email:"admin-staff@example.test",passwordHash:pw,role:"admin",active:true},
    {id:"staff-inventory-test",name:"Inventory",email:"inventory-staff@example.test",passwordHash:pw,role:"inventory_manager",active:true},
    {id:"staff-customer-test",name:"Customer",email:"customer-staff@example.test",passwordHash:pw,role:"customer",active:true},
  ]});
});
after(async()=>{await app?.close();});

test("only an administrator can view real staff and active/disabled branch options",async()=>{
  assert.equal((await request("/admin/staff")).status,401);
  for(const email of ["inventory-staff@example.test","customer-staff@example.test"]){
    const h=await webSession(email);
    assert.equal((await request("/admin/staff","GET",undefined,h)).status,403);
    assert.equal((await request("/admin/staff","POST",{
      name:"Fake Admin",email:"fake-admin@example.test",password,locationIds:["loc_accra"],
      role:"admin",
    },h)).status,403);
  }
  const admin=await webSession("admin-staff@example.test");
  const result=await request("/admin/staff","GET",undefined,admin);
  assert.equal(result.status,200);
  assert.equal(result.data.data.staff.some((x:{role:string})=>x.role==="admin"),true);
  assert.equal(result.data.data.staff.some((x:{role:string})=>x.role==="customer"),false);
  assert.equal(result.data.data.locations.length,3);
  assert.equal(JSON.stringify(result.data).includes("passwordHash"),false);
});

test("cashier provisioning strictly validates role, branch, duplicate email, and returns no secrets",async()=>{
  const admin=await webSession("admin-staff@example.test");
  const baseRequest={
    name:"Synthetic Accra Cashier",email:"new.cashier@example.test",
    phone:"",password,locationIds:["loc_accra","loc_kumasi"],
  };
  assert.equal((await request("/admin/staff","POST",{...baseRequest,role:"admin"},admin)).status,400);
  assert.equal((await request("/admin/staff","POST",{...baseRequest,password:"weak"},admin)).status,400);
  assert.equal((await request("/admin/staff","POST",{...baseRequest,locationIds:["loc_disabled"]},admin)).status,400);
  assert.equal((await request("/admin/staff","POST",{...baseRequest,locationIds:["loc_accra","loc_accra"]},admin)).status,400);
  assert.equal((await request("/admin/staff","POST",{...baseRequest,locationIds:["does-not-exist"]},admin)).status,400);
  const created=await request("/admin/staff","POST",baseRequest,admin);
  assert.equal(created.status,201,JSON.stringify(created.data));
  const user=created.data.data;
  assert.equal(user.role,"cashier");
  assert.equal(user.active,true);
  assert.deepEqual(user.locationIds,["loc_accra","loc_kumasi"]);
  assert.equal(JSON.stringify(created.data).includes(password),false);
  assert.equal(JSON.stringify(created.data).includes("passwordHash"),false);
  const persisted=await db.user.findUniqueOrThrow({where:{id:user.id}});
  assert.notEqual(persisted.passwordHash,password);
  assert.match(persisted.passwordHash,/^scrypt\$/);
  assert.equal((await request("/admin/staff","POST",baseRequest,admin)).status,409);
  assert.equal(await db.user.count({where:{email:"new.cashier@example.test"}}),1);
  const audits=await db.auditEvent.findMany({where:{entityId:user.id}});
  assert.equal(audits.length,1);
  assert.equal(audits[0].action,"staff.cashier_created");
  assert.equal(JSON.stringify(audits).includes(password),false);
});

test("cashier grants, suspension and password reset revoke sessions without changing another role",async()=>{
  const admin=await webSession("admin-staff@example.test");
  let cashier=await db.user.findUniqueOrThrow({where:{email:"new.cashier@example.test"}});
  let loggedIn=await webSession("new.cashier@example.test");
  assert.equal((await request("/auth/me","GET",undefined,loggedIn)).status,200);
  const actorId=cashier.id;
  assert.equal((await request(`/admin/staff/${actorId}/actions`,"POST",
    {action:"assign_locations",locationIds:["loc_disabled"]},admin)).status,400);
  assert.equal((await request(`/admin/staff/${actorId}/actions`,"POST",
    {action:"assign_locations",locationIds:["loc_accra"]},loggedIn)).status,403);
  assert.equal((await request("/admin/staff/staff-admin-test/actions","POST",
    {action:"set_active",active:false},admin)).status,403);
  assert.equal((await request("/admin/staff/staff-inventory-test/actions","POST",
    {action:"set_active",active:false},admin)).status,404);

  let update=await request(`/admin/staff/${actorId}/actions`,"POST",
    {action:"assign_locations",locationIds:["loc_kumasi"]},admin);
  assert.equal(update.status,201,JSON.stringify(update.data));
  assert.deepEqual(update.data.data.locationIds,["loc_kumasi"]);
  assert.equal((await request("/auth/me","GET",undefined,loggedIn)).status,401);
  loggedIn=await webSession("new.cashier@example.test");
  let me=await request("/auth/me","GET",undefined,loggedIn);
  assert.deepEqual(me.data.data.actor.locationIds,["loc_kumasi"]);

  update=await request(`/admin/staff/${actorId}/actions`,"POST",
    {action:"set_active",active:false},admin);
  assert.equal(update.status,201);
  assert.equal(update.data.data.active,false);
  assert.equal((await request("/auth/me","GET",undefined,loggedIn)).status,401);
  const failed=await request("/auth/sessions","POST",{
    email:"new.cashier@example.test",password,client:"web",
  },{origin});
  assert.equal(failed.status,401);

  update=await request(`/admin/staff/${actorId}/actions`,"POST",
    {action:"set_active",active:true},admin);
  assert.equal(update.status,201);
  loggedIn=await webSession("new.cashier@example.test");
  update=await request(`/admin/staff/${actorId}/actions`,"POST",
    {action:"reset_password",password:nextPassword},admin);
  assert.equal(update.status,201);
  assert.equal((await request("/auth/me","GET",undefined,loggedIn)).status,401);
  assert.equal(JSON.stringify(update.data).includes(nextPassword),false);
  const newSession=await webSession("new.cashier@example.test",nextPassword);
  assert.equal((await request("/auth/me","GET",undefined,newSession)).status,200);
  const audit=await db.auditEvent.findMany({where:{entityId:actorId}});
  assert.ok(audit.some(x=>x.action==="staff.cashier_assign_locations"));
  assert.ok(audit.some(x=>x.action==="staff.cashier_set_active"));
  assert.ok(audit.some(x=>x.action==="staff.cashier_reset_password"));
  assert.equal(JSON.stringify(audit).includes(nextPassword),false);
  cashier=await db.user.findUniqueOrThrow({where:{id:actorId}});
  assert.equal(cashier.role,"cashier");
});

test("public OpenAPI documents both staff routes, strict schemas and actor-only authentication",()=>{
  const doc=productionOpenApi(app);
  const staff=doc.paths["/api/v1/admin/staff"];
  const actions=doc.paths["/api/v1/admin/staff/{staffId}/actions"];
  assert.ok(staff.get);
  assert.ok(staff.post);
  assert.ok(actions.post);
  assert.deepEqual(staff.get.security,[{cookieAuth:[]},{bearerAuth:[]}]);
  assert.deepEqual(actions.post.security,[{cookieAuth:[]},{bearerAuth:[]}]);
  assert.equal(JSON.stringify(doc.components?.schemas?.StaffRowEnvelope).includes("password"),false);
  assert.equal(Object.keys(doc.paths).length,149);
});

test("new staff endpoints are disabled by default on non-UAT API configurations",async()=>{
  const admin=await webSession("admin-staff@example.test");
  const off=await createApplication(readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,
    WEB_ORIGINS:origin,
    API_STOCK_LOCATION_ID:"loc_accra",
    API_INSECURE_COOKIES:"true",
  }));
  try{
    await off.listen(0,"127.0.0.1");
    const url=await off.getUrl();
    const get=await fetch(url+"/api/v1/admin/staff",{headers:admin});
    assert.equal(get.status,503);
    const post=await fetch(url+"/api/v1/admin/staff",{
      method:"POST",headers:{...admin,"content-type":"application/json"},
      body:JSON.stringify({name:"Should Not Exist",email:"disabled@example.test",
        password,locationIds:["loc_accra"]}),
    });
    assert.equal(post.status,503);
    assert.equal(await db.user.count({where:{email:"disabled@example.test"}}),0);
  }finally{await off.close();}
});
