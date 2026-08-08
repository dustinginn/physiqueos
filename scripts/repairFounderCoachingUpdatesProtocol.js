import fs from "node:fs";
import path from "node:path";
import { readOperationalJsonFileSync } from "./lib/operationalJson.mjs";
import {
  createCoachingUpdatesProtocolStateRepairService,
} from "../src/domain/services/CoachingUpdatesProtocolStateRepairService.js";

const value = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const args = new Set(process.argv.slice(2));
const protocolId = value("--protocol-id");
const expectedVersionId = value("--version-id");
const expectedGoalId = value("--goal-id");

if (!args.has("--apply") || !protocolId || !expectedVersionId || !expectedGoalId) {
  console.error(
    "Refusing production repair. Usage: node scripts/repairFounderCoachingUpdatesProtocol.js --apply --protocol-id <id> --version-id <id> --goal-id <id>",
  );
  process.exit(2);
}

const runtimeStorePath = path.resolve(process.cwd(), "private", "founder", "runtime-store.json");
const liveStore = readOperationalJsonFileSync(runtimeStorePath,
  { stage: "coaching_updates_protocol_repair_source" });
const result = await createCoachingUpdatesProtocolStateRepairService({
  runtimeStorePath,
  liveStore,
}).repair({ protocolId, expectedVersionId, expectedGoalId });

console.log(JSON.stringify(result, null, 2));
if (!["success", "already_repaired"].includes(result.outcome)) process.exitCode = 1;
