// SYNTHETIC / NON-PRODUCTION combined-cutover rehearsal runner.
//
// Structurally incapable of touching production: it accepts no connection string, no credentials,
// no Founder paths, and no flag that switches it to production. It constructs only the in-memory
// transactional fixture. A real combined cutover will be a SEPARATE, future entry point.
//
// Usage: node scripts/runSyntheticCombinedCutoverRehearsal.mjs [outputDirectory]

import fs from "node:fs/promises";
import path from "node:path";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const {
  createSyntheticCombinedCutoverRehearsal,
  createDeterministicClock,
  inspectCombinedCutoverRecovery,
  REHEARSAL_ENVIRONMENT,
} = await import("../src/platform/cutover/syntheticCombinedCutoverRehearsal.js");

const outputDirectory = path.resolve(process.argv[2] ?? path.join("rehearsal-evidence", "synthetic-combined-cutover"));

async function scenario(name, run) {
  try {
    const evidence = await run();
    return { scenario: name, ok: true, evidence };
  } catch (error) {
    return { scenario: name, ok: false, error: { code: error?.code ?? null, message: error?.message ?? String(error) } };
  }
}

async function ready(options = {}) {
  const rehearsal = createSyntheticCombinedCutoverRehearsal(options);
  await rehearsal.initializeAuthority();
  return rehearsal;
}

const scenarios = [
  ["success", async () => {
    const rehearsal = await ready();
    const result = await rehearsal.execute();
    await rehearsal.crossFirstWriteBoundary();
    return rehearsal.evidence({ classification: result.classification });
  }],
  ["pre-boundary-abort", async () => {
    const rehearsal = await ready({ failAt: "verifyProviderParity" });
    const error = await rehearsal.execute().catch((caught) => caught);
    return rehearsal.evidence({ error });
  }],
  ["post-transfer-pre-write-failure", async () => {
    const rehearsal = await ready({ failAt: "afterTransferAuthority" });
    const error = await rehearsal.execute().catch((caught) => caught);
    return rehearsal.evidence({ error });
  }],
  ["first-write-rollback", async () => {
    const rehearsal = await ready({ failAt: "afterMutationBeforeCommit" });
    await rehearsal.execute();
    await rehearsal.crossFirstWriteBoundary().catch(() => undefined);
    return rehearsal.evidence({ classification: "FIRST_WRITE_ROLLED_BACK" });
  }],
  ["hard-crash-ambiguity", async () => {
    const rehearsal = await ready({ failAt: "afterBoundaryCommit" });
    await rehearsal.execute();
    await rehearsal.crossFirstWriteBoundary().catch(() => undefined);
    const durable = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
    const inspection = inspectCombinedCutoverRecovery(durable);
    const evidence = await rehearsal.evidence({ classification: inspection.classification });
    return { ...evidence, localMirrorFirstPostgresWriteAt: null, recoveryInspection: inspection };
  }],
  ["post-boundary-forward-recovery", async () => {
    const rehearsal = await ready();
    await rehearsal.execute();
    await rehearsal.crossFirstWriteBoundary();
    const inspection = inspectCombinedCutoverRecovery(rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT));
    const evidence = await rehearsal.evidence({ classification: inspection.classification });
    return { ...evidence, recoveryInspection: inspection };
  }],
  ["expired-budget", async () => {
    const rehearsal = await ready({
      clock: createDeterministicClock(),
      advanceAtStage: { stage: "exportFinalPackage", ms: 10 * 60_000 + 1 },
    });
    const error = await rehearsal.execute().catch((caught) => caught);
    return { ...(await rehearsal.evidence({ error })), abortCode: error?.code ?? null };
  }],
  ["duplicate-idempotent-initialization", async () => {
    const rehearsal = createSyntheticCombinedCutoverRehearsal();
    const first = await rehearsal.initializeAuthority();
    const second = await rehearsal.initializeAuthority();
    return { ...(await rehearsal.evidence({ classification: "IDEMPOTENT" })), first: first.outcome, second: second.outcome };
  }],
  ["invalid-start-provider-already-authoritative", async () => {
    const rehearsal = await ready();
    await rehearsal.execute();
    const error = await rehearsal.execute({ commandPrefix: "synthetic-retry" }).catch((caught) => caught);
    return { ...(await rehearsal.evidence({ classification: "REJECTED" })), rejectionCode: error?.code ?? null };
  }],
];

const results = [];
for (const [name, run] of scenarios) results.push(await scenario(name, run));

const report = {
  mode: "SYNTHETIC / NON-PRODUCTION",
  warning: "This evidence is from a synthetic rehearsal. It is NOT production cutover evidence.",
  generatedAt: new Date().toISOString(),
  scenarioCount: results.length,
  allScenariosProduced: results.every((entry) => entry.ok),
  results,
};

await fs.mkdir(outputDirectory, { recursive: true });
const file = path.join(outputDirectory, `synthetic-combined-cutover-${Date.now()}.json`);
await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({
  mode: report.mode,
  scenarioCount: report.scenarioCount,
  allScenariosProduced: report.allScenariosProduced,
  summary: results.map((entry) => ({
    scenario: entry.scenario,
    ok: entry.ok,
    authority: entry.evidence?.finalAuthority ?? null,
    firstProviderCanonicalWriteAt: entry.evidence?.firstProviderCanonicalWriteAt ?? null,
    rollbackLegal: entry.evidence?.rollbackLegal ?? null,
    forwardRecoveryRequired: entry.evidence?.forwardRecoveryRequired ?? null,
  })),
  evidenceFile: file,
}, null, 2)}\n`);
