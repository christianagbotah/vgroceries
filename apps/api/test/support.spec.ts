import { test } from "node:test";
import assert from "node:assert/strict";
import { supportCreateSchema, supportActionSchema } from "../src/support/support.service";
const valid={
 name:"UAT Sample Customer",phone:"0240000000",email:"demo@example.test",
 subject:"delivery",message:"This is a fictional staging customer callback request.",
 orderReference:"VG-TEST-123",preferredContact:"phone",consent:true,
};
test("support requires affirmative contact consent and clear message",()=>{
 assert.equal(supportCreateSchema.safeParse(valid).success,true);
 assert.equal(supportCreateSchema.safeParse({...valid,consent:false}).success,false);
 assert.equal(supportCreateSchema.safeParse({...valid,message:"short"}).success,false);
});
test("email callback needs email address",()=>{
 assert.equal(supportCreateSchema.safeParse({...valid,preferredContact:"email",email:""}).success,false);
 assert.equal(supportCreateSchema.safeParse({...valid,preferredContact:"email"}).success,true);
});
test("support payload rejects unrecognised keys and arbitrary status changes",()=>{
 assert.equal(supportCreateSchema.safeParse({...valid,isAdmin:true}).success,false);
 assert.equal(supportActionSchema.safeParse({status:"paid",note:"Customer contacted"}).success,false);
 assert.equal(supportActionSchema.safeParse({status:"resolved",note:"Called the UAT customer manually"}).success,true);
});
