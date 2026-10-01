import fs from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const html = fs.readFileSync(path.join(root, "prototype/index.html"), "utf8");
const schema = JSON.parse(fs.readFileSync(path.join(root, "recovery-briefing-v1.schema.json"), "utf8"));
const replay = JSON.parse(fs.readFileSync(path.join(root, "sanitized-zero-write-results.json"), "utf8"));

const scenarios = [
  "weekly-green",
  "weekly-yellow",
  "weekly-red",
  "midweek-green",
  "monthly-yellow",
  "insufficient-data",
  "green-imperfect-foam",
  "yellow-training-holds",
  "red-corroborated",
];

for (const scenario of scenarios) {
  if (!html.includes(`"${scenario}"`)) throw new Error(`Missing prototype scenario: ${scenario}`);
}
if (!html.includes("commentary:null")) throw new Error("Green must support commentary-free rendering.");
if (/recovery score/i.test(html)) throw new Error("Prototype must not introduce a Recovery Score.");
if (schema.properties.policy.properties.confidenceCoupling.const !== "none") {
  throw new Error("Recovery contract must remain decoupled from Goal Confidence.");
}
if (schema.properties.foamRolling.properties.displayRole.const !== "execution_context_only") {
  throw new Error("Foam rolling must remain execution context only.");
}
if (replay.scope.databaseWrites !== 0 || replay.scope.rawNightlyValuesIncluded !== false) {
  throw new Error("Replay output violates zero-write or sanitization requirements.");
}
if (replay.noiseChecks.greenWeeksThatWouldBecomeYellowWithoutPeriodMeanGate !== 4) {
  throw new Error("Expected noise-control replay result is absent.");
}
console.log(`Verified ${scenarios.length} prototype scenarios, schema guardrails, and sanitized zero-write replay.`);
