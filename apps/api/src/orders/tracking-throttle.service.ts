import { Injectable } from "@nestjs/common";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { tokenHash } from "../identity/crypto";
@Injectable()
export class TrackingThrottleService {
  constructor(private readonly db:Database){}
  async registerFailure(clientKey:string,reference:string):Promise<void>{
    const normalized=reference.trim().toUpperCase();
    const limits=[{key:tokenHash(`track:client:${clientKey}`),limit:100},{key:tokenHash(`track:pair:${clientKey}:${normalized}`),limit:5}].sort((a,b)=>a.key.localeCompare(b.key));
    const exceeded=await this.db.$transaction(async tx=>{let hit=false;for(const item of limits){const rows=await tx.$queryRaw<{attempts:number}[]>`INSERT INTO "TrackingThrottle" (key,"windowStart",attempts) VALUES (${item.key},now(),1) ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN "TrackingThrottle"."windowStart"<=now()-interval '15 minutes' THEN 1 ELSE "TrackingThrottle".attempts+1 END,"windowStart"=CASE WHEN "TrackingThrottle"."windowStart"<=now()-interval '15 minutes' THEN now() ELSE "TrackingThrottle"."windowStart" END RETURNING attempts`;hit ||= rows[0].attempts>item.limit;}return hit;});
    if(exceeded)throw new ApiProblem(429,"RATE_LIMITED","Too many tracking attempts. Try again later.");
  }
}
