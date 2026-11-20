/**
 * Read-only audit: compare a built Next.js POS-integrated staging release
 * against the current canonical pages and the documented staging exceptions.
 *
 * Usage:
 *   bun scripts/audit-manual-staging-parity.ts /abs/path/to/.next/server/app
 *
 * Does not connect to any service, parse environment variables, mutate the
 * database, deploy a release, authenticate a user, or alter source files.
 */
import {existsSync,readdirSync} from "node:fs";
import {relative,resolve,sep} from "node:path";
import {
  MANUAL_SCREENS,MANUAL_SOURCE_ONLY_PATHS,MANUAL_STAGING_SCREENS,
} from "../src/features/manual/catalogue";

export type ManualParityResult={
  canonicalCount:number;
  stagingCount:number;
  sharedCount:number;
  stagingOnly:string[];
  sourceOnly:string[];
  undocumentedStaging:string[];
  obsoleteStagingOverlays:string[];
  unreviewedSourceOnly:string[];
  obsoleteSourceOnlyOverlays:string[];
  matchesReviewedSnapshot:boolean;
};

const ordered=(values:Iterable<string>)=>[...new Set(values)].sort();

export function compareManualRouteSets(
  sourceRoutes:readonly string[],
  stagingRoutes:readonly string[],
  expectedStagingOnly:readonly string[],
  expectedSourceOnly:readonly string[],
):ManualParityResult{
  const source=new Set(sourceRoutes),staging=new Set(stagingRoutes);
  const stagingOnly=ordered([...staging].filter(route=>!source.has(route)));
  const sourceOnly=ordered([...source].filter(route=>!staging.has(route)));
  const reviewedStaging=new Set(expectedStagingOnly),reviewedSource=new Set(expectedSourceOnly);
  const undocumentedStaging=stagingOnly.filter(route=>!reviewedStaging.has(route));
  const obsoleteStagingOverlays=ordered([...reviewedStaging].filter(route=>!stagingOnly.includes(route)));
  const unreviewedSourceOnly=sourceOnly.filter(route=>!reviewedSource.has(route));
  const obsoleteSourceOnlyOverlays=ordered([...reviewedSource].filter(route=>!sourceOnly.includes(route)));
  return {
    canonicalCount:source.size,stagingCount:staging.size,
    sharedCount:ordered([...source].filter(route=>staging.has(route))).length,
    stagingOnly,sourceOnly,undocumentedStaging,obsoleteStagingOverlays,
    unreviewedSourceOnly,obsoleteSourceOnlyOverlays,
    matchesReviewedSnapshot:
      undocumentedStaging.length===0&&obsoleteStagingOverlays.length===0&&
      unreviewedSourceOnly.length===0&&obsoleteSourceOnlyOverlays.length===0,
  };
}

export function routeFromPageArtifact(rel:string):string|null{
  const parts=rel.replaceAll("\\","/").split("/");
  const last=parts.at(-1);
  if(last!=="page.js"&&last!=="page.tsx")return null;
  const routeParts=parts.slice(0,-1).filter(piece=>
    !(/^\(.*\)$/.test(piece))&&!piece.startsWith("_")&&!piece.startsWith("@"));
  if(parts.some(part=>part.startsWith("_")||part.startsWith("@")))return null;
  return "/"+routeParts.join("/");
}
export function discoverPageRoutes(root:string,extension:"js"|"tsx"):string[]{
  const found:string[]=[];
  const stack=[root];
  while(stack.length){
    const folder=stack.pop()!;
    for(const entry of readdirSync(folder,{withFileTypes:true})){
      const file=resolve(folder,entry.name);
      if(entry.isDirectory()){stack.push(file);continue;}
      if(!entry.isFile()||entry.name!==`page.${extension}`)continue;
      const route=routeFromPageArtifact(relative(root,file));
      if(route)found.push(route);
    }
  }
  return ordered(found);
}

function runCli(rootArg:string|undefined){
  if(!rootArg)throw new Error("Pass the absolute .next/server/app directory of the immutable POS staging release.");
  if(!rootArg.startsWith(sep))throw new Error("Use an absolute build-artifact directory, not an inferred relative release.");
  const buildRoot=resolve(rootArg);
  if(!existsSync(buildRoot))throw new Error("Staging build directory does not exist: "+buildRoot);
  const localRoot=resolve(import.meta.dir,"../src/app");
  const local=discoverPageRoutes(localRoot,"tsx").filter(route=>
    route!=="/manual"&&route!=="/rider/guide");
  const staging=discoverPageRoutes(buildRoot,"js");
  const result=compareManualRouteSets(
    local,staging,MANUAL_STAGING_SCREENS.map(s=>s.path),MANUAL_SOURCE_ONLY_PATHS);
  const canonicalCatalogue=ordered(MANUAL_SCREENS.map(s=>s.path));
  const sourceCatalogueMatch=JSON.stringify(canonicalCatalogue)===JSON.stringify(ordered(local));
  process.stdout.write(JSON.stringify({
    releaseArtifactDirectory:buildRoot,
    reviewedSourceCount:local.length,
    sourceCatalogueMatch,
    ...result,
    warning:"Read-only route presence is NOT role, feature flag, API parity, test data or production acceptance.",
  },null,2)+"\n");
  if(!result.matchesReviewedSnapshot||!sourceCatalogueMatch)process.exitCode=1;
}

if(import.meta.main){
  try{runCli(process.argv[2]);}
  catch(error){process.stderr.write((error instanceof Error?error.message:String(error))+"\n");process.exitCode=2;}
}
