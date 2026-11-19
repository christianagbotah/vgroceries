/// <reference types="bun-types" />
import {describe,expect,test} from "bun:test";
import {mkdtempSync,writeFileSync,readFileSync,statSync,existsSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";

const script="scripts/prepare-hubtel-hosted-staging-env.py";
const fakeSource="HUBTEL_SALES_API_ID=test-sales-id\nHUBTEL_SALES_API_KEY='synthetic-test-value-only'\nHUBTEL_COLLECTION_ACCOUNT_NUMBER=123456\n";
function run(args:string[]){
  return spawnSync("python3",[script,...args],{cwd:process.cwd(),encoding:"utf8",timeout:10000});
}
describe("Hubtel hosted staging configuration is prepared but never activated",()=>{
 test("default command only validates source without writing a secret bundle",()=>{
  const dir=mkdtempSync(join(tmpdir(),"vg-hubtel-prep-"));
  try{
    const source=join(dir,"merchant.env"),dest=join(dir,"staging.pending");
    writeFileSync(source,fakeSource,{mode:0o600});
    const result=run(["--source",source,"--destination",dest]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no file written or payment made");
    expect(existsSync(dest)).toBe(false);
    expect(result.stdout).not.toContain("synthetic-test-value-only");
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 test("explicit write creates only an inactive, private and non-overwritten file",()=>{
  const dir=mkdtempSync(join(tmpdir(),"vg-hubtel-prep-"));
  try{
    const source=join(dir,"merchant.env"),dest=join(dir,"staging.pending");
    writeFileSync(source,fakeSource,{mode:0o600});
    const result=run(["--source",source,"--destination",dest,"--write"]);
    expect(result.status).toBe(0);
    expect(statSync(dest).mode&0o777).toBe(0o600);
    const contents=readFileSync(dest,"utf8");
    expect(contents).toContain("# INACTIVE CONFIGURATION ONLY");
    expect(contents).toContain('PAYMENT_ENABLED_METHODS="hosted_checkout"');
    expect(contents).toContain('HUBTEL_CLIENT_ID="test-sales-id"');
    expect(contents).toContain("https://api-txnstatus.hubtel.com");
    expect(contents).not.toContain("HUBTEL_SALES_API_KEY=");
    expect(result.stdout).not.toContain("synthetic-test-value-only");
    const repeated=run(["--source",source,"--destination",dest,"--write"]);
    expect(repeated.status).toBe(1);
    expect(readFileSync(dest,"utf8")).toBe(contents);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 test("missing collection credentials fail closed without creating a file",()=>{
  const dir=mkdtempSync(join(tmpdir(),"vg-hubtel-prep-"));
  try{
    const source=join(dir,"merchant.env"),dest=join(dir,"staging.pending");
    writeFileSync(source,"HUBTEL_SALES_API_ID=test\nHUBTEL_SALES_API_KEY=test\n",{mode:0o600});
    const x=run(["--source",source,"--destination",dest,"--write"]);
    expect(x.status).toBe(1);
    expect(x.stdout).toContain("HUBTEL_COLLECTION_ACCOUNT_NUMBER");
    expect(existsSync(dest)).toBe(false);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
