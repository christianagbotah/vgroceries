import {PrismaClient} from "@prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";
import {stageOrderEmailBatch} from "../src/notifications/order-email-stage-batch";
import {dispatchOneOrderEmail} from "../src/notifications/order-email-dispatch";
import {validateOrderEmailConfig} from "../src/notifications/order-email-transport";

async function main(){
 const staging=process.env.CUSTOMER_ORDER_EMAIL_STAGING_ENABLED==="true";
 const dispatch=process.env.CUSTOMER_ORDER_EMAIL_DISPATCH_ENABLED==="true";
 if(!staging&&!dispatch){console.log("Order email worker disabled.");return;}
 const databaseUrl=process.env.DATABASE_URL,keyHex=process.env.CUSTOMER_MESSAGE_ENCRYPTION_KEY??"";
 if(!databaseUrl||! /^[a-f0-9]{64}$/i.test(keyHex))throw Error("Email worker configuration incomplete.");
 const config={enabled:dispatch,from:process.env.CUSTOMER_ORDER_EMAIL_FROM??"",sendmailPath:process.env.CUSTOMER_ORDER_EMAIL_SENDMAIL_PATH??""};
 if(dispatch)validateOrderEmailConfig(config);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:databaseUrl})});
 try{
  const stage=await stageOrderEmailBatch(db,{enabled:staging,keyHex,take:50});
  const counts:Record<string,number>={};
  if(dispatch)for(let i=0;i<10;i++){
   const result=await dispatchOneOrderEmail(db,{enabled:true,keyHex,config});
   counts[result.outcome]=(counts[result.outcome]??0)+1;
   if(["busy","empty","unknown"].includes(result.outcome))break;
  }
  console.log(JSON.stringify({scanned:stage.scanned,queued:stage.queued,outcomes:counts}));
  if(counts.unknown)process.exitCode=1;
 }finally{await db.$disconnect();}
}
main().catch(()=>{console.error("Order email worker failed; consult restricted operational logs.");process.exitCode=1;});
