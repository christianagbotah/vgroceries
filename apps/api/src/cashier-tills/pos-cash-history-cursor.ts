import {z} from "zod";
import {ApiProblem} from "../http/errors";

const cursorSchema=z.object({
  createdAt:z.string().datetime({offset:true}),
  id:z.string().uuid(),
}).strict();

export const posCashHistoryQuerySchema=z.object({
  cursor:z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit:z.coerce.number().int().min(1).max(50).optional(),
}).strict();

/** Cursor is positional, not authorization: every endpoint rechecks admin. */
export function decodePosCashHistoryCursor(cursor:string|undefined){
  if(cursor===undefined)return undefined;
  try{
    if(cursor.length>256||!/^[A-Za-z0-9_-]+$/.test(cursor))
      throw new Error("Invalid encoding");
    const bytes=Buffer.from(cursor,"base64url");
    if(bytes.toString("base64url")!==cursor)
      throw new Error("Non-canonical encoding");
    const parsed=cursorSchema.parse(JSON.parse(bytes.toString("utf8")));
    const date=new Date(parsed.createdAt);
    if(!Number.isFinite(date.getTime()))
      throw new Error("Invalid timestamp");
    return {createdAt:date,id:parsed.id};
  }catch{
    throw new ApiProblem(400,"VALIDATION_FAILED","Invalid cash sale history cursor.");
  }
}

export function encodePosCashHistoryCursor(row:{createdAt:Date;id:string}){
  if(!Number.isFinite(row.createdAt.getTime())||
    !cursorSchema.shape.id.safeParse(row.id).success)
    throw new Error("Cannot generate cash history cursor from invalid record");
  const encoded=Buffer.from(JSON.stringify({
    createdAt:row.createdAt.toISOString(),id:row.id,
  })).toString("base64url");
  if(encoded.length>256)throw new Error("Cash history cursor exceeded maximum length");
  return encoded;
}
