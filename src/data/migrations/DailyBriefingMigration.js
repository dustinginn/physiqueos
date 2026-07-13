import crypto from "node:crypto";
import { assertFlatBriefingHistory, getBriefingOccurrenceIdentity, normalizeDailyBriefingRecords, sanitizeHistoricalBriefingArtifact, stableSerialize } from "../repositories/DailyBriefingHistory.js";

export const DAILY_BRIEFING_MIGRATION_VERSION = "daily-briefing-history-v1";

export function migrateDailyBriefingRuntimeStore(source) {
  const started=performance.now();
  if (!source || typeof source!=="object" || Array.isArray(source)) throw new Error("Runtime store must be an object.");
  if (!Array.isArray(source.dailyBriefings)) throw new Error("Runtime store dailyBriefings must be an array.");
  const discovery=discover(source.dailyBriefings);
  const roots=normalizeDailyBriefingRecords(source.dailyBriefings);
  assertFlatBriefingHistory(roots);
  const candidate={...source,dailyBriefings:roots};
  const conflicts=findConflicts(discovery.artifacts);
  const malformed=discovery.malformed;
  const nonBriefing=validateNonBriefing(source,candidate);
  const mapped=new Set();
  for(const root of roots){mapped.add(variantKey(sanitizeHistoricalBriefingArtifact(root)));for(const entry of root.replacedBriefingHistory??[])mapped.add(variantKey(entry.artifact));}
  const lost=[...new Set(discovery.artifacts.map((item)=>item.variantKey))].filter((key)=>!mapped.has(key));
  const second={...candidate,dailyBriefings:normalizeDailyBriefingRecords(candidate.dailyBriefings)};
  const idempotent=stableSerialize(second)===stableSerialize(candidate);
  const valid=conflicts.length===0&&malformed.length===0&&lost.length===0&&nonBriefing.every((item)=>item.equal)&&idempotent;
  return {candidate,report:{migrationVersion:DAILY_BRIEFING_MIGRATION_VERSION,status:valid?"dry-run-valid":"dry-run-invalid",promotionEligible:valid,artifactAccounting:{occurrences:discovery.artifacts.length,uniqueVariants:new Set(discovery.artifacts.map((x)=>x.variantKey)).size,exactDuplicatesRemoved:discovery.artifacts.length-new Set(discovery.artifacts.map((x)=>x.variantKey)).size,lost},rootAccounting:{before:source.dailyBriefings.length,after:roots.length},conflictAccounting:conflicts,malformedEntries:malformed,structuralValidation:{flat:true,maxSourceDepth:discovery.maxDepth,maxCandidateDepth:maxDepth(roots),idempotent},metadataValidation:{allVariantsMapped:lost.length===0},nonBriefingRepositoryValidation:nonBriefing,behaviorParity:selectionParity(source.dailyBriefings,roots),idempotencyValidation:{passed:idempotent},timing:{migrationMs:+(performance.now()-started).toFixed(2)},errors:[...malformed.map(x=>x.reason),...lost.map(x=>`Lost artifact ${x}`)]}};
}

function discover(roots){const artifacts=[],malformed=[];let max=0;function artifact(a,path,root,depth){if(!a||typeof a!=="object"||Array.isArray(a)){malformed.push({path,reason:"History wrapper does not contain an artifact.",raw:a});return;}max=Math.max(max,depth);for(let i=0;i<(a.replacedBriefingHistory??[]).length;i++)entry(a.replacedBriefingHistory[i],`${path}.replacedBriefingHistory[${i}]`,root,depth+1);const clean=sanitizeHistoricalBriefingArtifact(a);artifacts.push({path,parentRoot:root,variantKey:variantKey(clean),artifact:clean});}function entry(e,path,root,depth){if(!e||typeof e!=="object"||Array.isArray(e)){malformed.push({path,reason:"Malformed history entry.",raw:e});return;}const keys=["artifact","briefing","previousEntry"].filter(k=>e[k]&&typeof e[k]==="object");if(keys.length!==1){malformed.push({path,reason:`Expected one recognized artifact wrapper; found ${keys.length}.`,raw:e});return;}artifact(e[keys[0]],`${path}.${keys[0]}`,root,depth);}roots.forEach((r,i)=>artifact(r,`$.dailyBriefings[${i}]`,r?.id??i,0));return{artifacts,malformed,maxDepth:max};}
function artifactIdentity(a){const id=String(a?.id??"").trim();const ns=[a?.userId,a?.artifactType,a?.cadence].map(x=>String(x??"").trim()).join("|");return id?`${ns}|${id}`:`${getBriefingOccurrenceIdentity(a)??ns}|missing|${a?.generatedAt??a?.createdAt??""}`;}
function variantKey(a){return `${artifactIdentity(a)}#${sha(stableSerialize(a))}`;}
function findConflicts(items){const by=new Map();for(const x of items){const id=artifactIdentity(x.artifact);const hashes=by.get(id)??new Set();hashes.add(x.variantKey.split("#").at(-1));by.set(id,hashes);}return [...by].filter(([,h])=>h.size>1).map(([identity,h])=>({identity,variants:[...h].sort()}));}
function validateNonBriefing(a,b){return Object.keys(a).filter(k=>k!=="dailyBriefings").sort().map(key=>({key,beforeHash:sha(stableSerialize(a[key])),afterHash:sha(stableSerialize(b[key])),equal:stableSerialize(a[key])===stableSerialize(b[key])}));}
function selectionParity(before,after){const select=(records,predicate)=>records.filter(predicate).sort((a,b)=>String(b.generatedAt??"").localeCompare(String(a.generatedAt??"")))[0]?.id??null;const categories={activeEvent:x=>x.artifactType==="event"&&!x.lifecycle?.consumedAt,scheduled:x=>x.artifactType!=="event",weekly:x=>x.cadence==="weekly",monthly:x=>x.cadence==="monthly",photoEvent:x=>x.artifactType==="event"&&x.trigger?.evidenceType==="photo_session",dexaEvent:x=>x.artifactType==="event"&&["dexa","dexa_scan"].includes(x.trigger?.evidenceType)};const result={};for(const [key,p] of Object.entries(categories)){const x=select(before,p),y=select(after,p);result[key]={before:x,after:y,equal:x===y};}result.passed=Object.values(result).every(x=>x===true||x.equal);return result;}
function maxDepth(roots){let max=0;function walk(a,d){max=Math.max(max,d);for(const e of a?.replacedBriefingHistory??[])walk(e.artifact,d+1);}roots.forEach(x=>walk(x,0));return max;}
export function sha(value){return crypto.createHash("sha256").update(value).digest("hex");}
