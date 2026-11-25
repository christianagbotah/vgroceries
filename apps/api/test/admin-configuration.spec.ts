import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { businessProfileSchema, deliveryPartnerSchema, parseCredentialDraft } from "../src/admin-configuration/admin-configuration.schemas";
import { encryptCredentialDraft } from "../src/admin-configuration/integration-vault";

const business={version:1,businessName:"Example Groceries",supportPhone:"+233241111111",supportEmail:"support@example.test",address:"Accra",registrationNumber:"",operatingHours:"Mon-Sat 8-18",receiptFooter:"Thank you"};
test("business profile only accepts identity and contact fields",()=>{
 assert.equal(businessProfileSchema.safeParse(business).success,true);
 for(const extra of [{currency:"USD"},{codEnabled:true},{actor:"admin"},{version:0},{supportEmail:"bad"},{businessName:" "}])
  assert.equal(businessProfileSchema.safeParse({...business,...extra}).success,false);
});
test("manual partner directory cannot claim verified integration",()=>{
 const partner={name:"Example courier",contactPhone:"",contactEmail:"",coverage:"Accra",notes:"Manual dispatch",active:true};
 assert.equal(deliveryPartnerSchema.safeParse(partner).success,true);
 assert.equal(deliveryPartnerSchema.safeParse({...partner,apiConnected:true}).success,false);
 assert.equal(deliveryPartnerSchema.safeParse({...partner,endpoint:"https://example.test"}).success,false);
});
test("credential drafts use provider-specific strict fields",()=>{
 const credentials={clientId:"test-client",clientSecret:"synthetic-secret",senderId:"Example"};
 assert.ok(parseCredentialDraft("hubtel-sms",{version:0,credentials}));
 assert.equal(parseCredentialDraft("hubtel-sms",{version:0,credentials:{...credentials,endpoint:"https://example.test"}}),null);
 assert.equal(parseCredentialDraft("hubtel-sms",{version:0,credentials:{...credentials,senderId:""}}),null);
 assert.equal(parseCredentialDraft("hubtel-sms",{version:0,credentials,activate:true}),null);
 assert.equal(parseCredentialDraft("paystack-payment",{version:0,credentials}),null);
});
test("vault uses randomized authenticated encryption bound to record and revision",()=>{
 const key="12".repeat(32), value={secretKey:"synthetic-fixture-only"}, id="paystack-payment";
 const a=encryptCredentialDraft(id,1,value,key), b=encryptCredentialDraft(id,1,value,key);
 assert.notEqual(a,b);assert.ok(!a.includes(value.secretKey));
 const decrypt=(record:string,revision:number)=>{
  const [,iv,data,tag]=a.split(".");
  const cipher=createDecipheriv("aes-256-gcm",Buffer.from(key,"hex"),Buffer.from(iv,"base64url"));
  cipher.setAAD(Buffer.from(JSON.stringify(["integration-draft-v1",record,revision])));
  cipher.setAuthTag(Buffer.from(tag,"base64url"));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,"base64url")),cipher.final()]).toString("utf8"));
 };
 assert.deepEqual(decrypt(id,1),value);
 assert.throws(()=>decrypt(id,2));assert.throws(()=>decrypt("hubtel-sms",1));
 assert.throws(()=>encryptCredentialDraft(id,1,value,"invalid"));
});
