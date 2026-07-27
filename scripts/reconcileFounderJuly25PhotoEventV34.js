import fs from "node:fs";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../src/data/repositories/founderRuntimeStore.js";
import { createJuly25PhotoEventV34ReconciliationService } from "../src/domain/services/July25PhotoEventV34ReconciliationService.js";

async function main(){
  const runtimeStorePath=resolveFounderRuntimeStorePath();
  const liveStore=getFounderRuntimeStore();
  const service=createJuly25PhotoEventV34ReconciliationService({
    runtimeStorePath,liveStore,
    readPersistedStore:()=>JSON.parse(fs.readFileSync(runtimeStorePath,"utf8")),
  });
  const result=await service.execute();
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
  if(!["reconciled","matched"].includes(result.outcome))process.exitCode=1;
}

main().catch((error)=>{
  process.stderr.write(`${error.stack??error.message}\n`);
  process.exitCode=1;
});
