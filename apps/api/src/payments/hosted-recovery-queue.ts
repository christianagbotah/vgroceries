import type { Database } from "../database/database";
import { isHostedRecoveryCandidate } from "./hosted-payment-recovery";

export const lookupStartActions = ["payment.customer_lookup_started","payment.worker_lookup_started"];
export const hostedRecoveryBatchSize = 10;

export function hostedRecoveryIntervalMs(reconcileAfterSeconds:number,requestTimeoutMs:number){
  if(!Number.isFinite(reconcileAfterSeconds)||reconcileAfterSeconds<0||!Number.isFinite(requestTimeoutMs)||requestTimeoutMs<=0)
    throw Error("Invalid hosted recovery interval.");
  return Math.max(60_000,reconcileAfterSeconds*1000,requestTimeoutMs+2_000);
}

/** Least-recently-checked eligible attempts first. The two indexed lateral
 * lookups use durable reconciliation evidence and claims, including crashes
 * after a claim. No payment state, money, stock or customer contact is changed. */
export async function selectHostedRecoveryBatch(db:Database,cutoff:Date){
  if(!Number.isFinite(cutoff.getTime()))throw Error("Invalid hosted recovery cutoff.");
  return db.$queryRaw<Array<{id:string;orderId:string}>>`
    SELECT p.id,p."orderId"
    FROM "PaymentAttempt" p
    LEFT JOIN LATERAL (
      SELECT r."createdAt" AS checked
      FROM "PaymentReconciliation" r
      WHERE r."paymentAttemptId"=p.id AND r.trigger IN ('worker','customer_retry')
      ORDER BY r."createdAt" DESC LIMIT 1
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT a."createdAt" AS started
      FROM "AuditEvent" a
      WHERE a."entityId"=p.id AND a.action IN ('payment.customer_lookup_started','payment.worker_lookup_started')
      ORDER BY a."createdAt" DESC LIMIT 1
    ) a ON true
    WHERE p.provider='hubtel' AND p.method='hosted_checkout'
      AND p.status='pending' AND p."initiationState"='accepted'
      AND p."settlementState"='unsettled'
      AND GREATEST(p."updatedAt",r.checked,a.started)<=${cutoff}
    ORDER BY GREATEST(p."updatedAt",r.checked,a.started) ASC,p.id ASC
    LIMIT ${hostedRecoveryBatchSize}
  `;
}

/** Claim under the same per-order lock as interactive customer refresh.
 * A claim survives a worker crash and bounds repeated failed checks.
 * Do not hold a DB transaction open while talking to the provider. */
export async function claimHostedRecovery(db:Database,row:{id:string;orderId:string},intervalMs:number,requestId:string,now=new Date()){
  if(!Number.isFinite(intervalMs)||intervalMs<60_000||!Number.isFinite(now.getTime()))throw Error("Invalid recovery claim timing.");
  const cutoff=new Date(now.getTime()-intervalMs);
  return db.$transaction(async tx=>{
    const lock=await tx.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${"checkout-payment-refresh:"+row.orderId},0)) AS locked`;
    if(!lock[0]?.locked)return false;
    const attempt=await tx.paymentAttempt.findUnique({where:{id:row.id}});
    if(!attempt||attempt.orderId!==row.orderId||!isHostedRecoveryCandidate(attempt)||attempt.updatedAt>cutoff)return false;
    const recent=await tx.auditEvent.findFirst({where:{entityId:row.id,action:{in:lookupStartActions},createdAt:{gte:cutoff}},select:{id:true}});
    if(recent)return false;
    const checked=await tx.paymentReconciliation.findFirst({where:{paymentAttemptId:row.id,trigger:{in:["worker","customer_retry"]},createdAt:{gte:cutoff}},select:{id:true}});
    if(checked)return false;
    await tx.auditEvent.create({data:{actorId:"payment-reconciliation-worker",action:"payment.worker_lookup_started",entityId:row.id,requestId,details:{}}});
    return true;
  });
}
