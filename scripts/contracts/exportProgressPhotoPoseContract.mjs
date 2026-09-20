// Writes (or, with --check, verifies) the machine-readable Progress Photo pose
// contract that Native derives its controls from. The Server vocabulary is the
// single authority; this file is a generated artifact, never hand-edited.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProgressPhotoPoseContract } from "../../src/domain/models/progressPhotoPoseVocabulary.js";

export const POSE_CONTRACT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../contracts/progress-photo-pose-contract.v1.json");

export function renderProgressPhotoPoseContract() {
  return `${JSON.stringify(getProgressPhotoPoseContract(), null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rendered = renderProgressPhotoPoseContract();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(POSE_CONTRACT_PATH) ? fs.readFileSync(POSE_CONTRACT_PATH, "utf8") : null;
    if (current !== rendered) { console.error("progress-photo-pose-contract.v1.json is out of date; run without --check."); process.exit(1); }
    console.log("progress-photo-pose-contract.v1.json is current.");
  } else {
    fs.writeFileSync(POSE_CONTRACT_PATH, rendered);
    console.log(`wrote ${POSE_CONTRACT_PATH}`);
  }
}
