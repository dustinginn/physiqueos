import fs from "node:fs";
import path from "node:path";
import { readOperationalJsonFileSync } from "./lib/operationalJson.mjs";
import { createNutritionProtocolStateRepairService } from "../src/domain/services/NutritionProtocolStateRepairService.js";

const args = new Set(process.argv.slice(2));
const value = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const protocolId = value("--protocol-id");
const expectedGoalId = value("--goal-id");
if (!args.has("--apply") || !protocolId || !expectedGoalId) {
  console.error("Refusing production repair. Usage: node scripts/repairFounderNutritionProtocol.js --apply --protocol-id <id> --goal-id <id>");
  process.exit(2);
}
const runtimeStorePath = path.resolve(process.cwd(), "private", "founder", "runtime-store.json");
const liveStore = readOperationalJsonFileSync(runtimeStorePath,
  { stage: "nutrition_protocol_repair_source" });
const result = await createNutritionProtocolStateRepairService({
  runtimeStorePath,
  liveStore,
}).repair({ protocolId, expectedGoalId });
console.log(JSON.stringify(result, null, 2));
if (!["success", "already_repaired"].includes(result.outcome)) process.exitCode = 1;
