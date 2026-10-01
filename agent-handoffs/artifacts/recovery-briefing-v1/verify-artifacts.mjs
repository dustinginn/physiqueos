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
if ((html.match(/data-recovery-card="true"/g) ?? []).length !== 1) {
  throw new Error("Prototype template must render exactly one Recovery card.");
}
if (/class="hero"|\.hero\s*\{|class="commentary"|\.commentary\s*\{/i.test(html)) {
  throw new Error("Recovery hero and nested commentary cards must remain absent.");
}
if (!html.includes('class="inline-commentary"')) {
  throw new Error("Yellow and Red commentary must render inline in the Recovery card.");
}
for (const scenario of ["weekly-green", "midweek-green", "green-imperfect-foam"]) {
  const start = html.indexOf(`"${scenario}"`);
  const end = html.indexOf("\n", start);
  if (html.slice(start, end).includes("commentary:")) {
    throw new Error(`Green scenario must not carry commentary: ${scenario}`);
  }
}
if (/recovery score/i.test(html)) throw new Error("Prototype must not introduce a Recovery Score.");
if (schema.properties.shadow.const !== true) {
  throw new Error("Recovery contract must remain shadow-only.");
}
if (schema.properties.policy.properties.confidenceCoupling.const !== "none") {
  throw new Error("Recovery contract must remain decoupled from Goal Confidence.");
}
if (schema.properties.foamRolling.properties.displayRole.const !== "execution_context_only") {
  throw new Error("Foam rolling must remain execution context only.");
}
if (schema.properties.policy.properties.trainingCanManufactureNonGreenStatus.const !== false ||
    schema.properties.policy.properties.causalClaimsAllowed.const !== false) {
  throw new Error("Training must not manufacture Recovery status or causal claims.");
}
if (schema.properties.provenance.properties.persistenceWrites.const !== 0 ||
    schema.properties.provenance.properties.strategicEligibility.const !== "excluded") {
  throw new Error("Recovery contract must remain persistence-free and non-strategic.");
}
if (replay.scope.databaseWrites !== 0 || replay.scope.rawNightlyValuesIncluded !== false) {
  throw new Error("Replay output violates zero-write or sanitization requirements.");
}
if (replay.noiseChecks.greenWeeksThatWouldBecomeYellowWithoutPeriodMeanGate !== 4) {
  throw new Error("Expected noise-control replay result is absent.");
}
console.log(`Verified one-card rendering across ${scenarios.length} scenarios, shadow schema guardrails, and sanitized zero-write replay.`);
