import { register } from "node:module";

register(new URL("./sourceModuleResolutionHook.mjs", import.meta.url));

const [
  { FounderRepositories },
  { createCadenceExecutionStore },
  { resolveBriefingCadenceRegistry },
] = await Promise.all([
  import("../src/data/repositories/founderRepositories.js"),
  import("../src/data/operations/CadenceExecutionStore.js"),
  import("../src/domain/services/BriefingCadenceRegistryService.js"),
]);

const now = new Date();
const registry = await resolveBriefingCadenceRegistry({
  repositories: FounderRepositories,
  generators: {},
  now,
});
const records = await createCadenceExecutionStore().list();
const status = [];
for (const entry of registry) {
  const cadenceRecords = records
    .filter((record) => record.cadenceKey === entry.cadence)
    .sort((left, right) =>
      String(right.invokedAt).localeCompare(String(left.invokedAt))
    );
  const artifact = entry.evidenceWindow
    ? await entry.findExpectedArtifact()
    : await latestCompleted(entry);
  const successfulRecords = cadenceRecords.filter((record) =>
    ["generation_completed", "already_completed"].includes(record.resultStatus)
  );
  const lastSuccess = successfulRecords[0] ?? null;
  const unresolvedFailures = cadenceRecords.filter((record) =>
    ["transient_failure", "terminal_failure"].includes(record.resultStatus) &&
    (!lastSuccess || String(record.invokedAt) > String(lastSuccess.invokedAt))
  ).slice(0, 10);
  status.push({
    cadence: entry.cadence,
    enabled: entry.enabled,
    timezone: entry.timeZone,
    localNow: `${entry.localDate}T${entry.localTime}`,
    eligible: entry.eligible,
    eligibilityReason: entry.eligibilityReason,
    currentExpectedWindow: entry.evidenceWindow,
    currentExpectedPeriod: entry.cadence === "monthly"
      ? entry.evidenceWindow?.briefingMonth ?? null
      : null,
    expectedArtifactId: entry.expectedArtifactId,
    expectedArtifactExists: entry.evidenceWindow
      ? Boolean(artifact?.briefing)
      : null,
    lastExecution: cadenceRecords[0] ?? null,
    lastSuccess,
    lastSuccessfulArtifact: artifact
      ? {
        id: artifact.id,
        generatedAt: artifact.generatedAt,
        evidenceWindow: artifact.evidenceWindow,
      }
      : null,
    nextEligibility: entry.nextEligibility,
    catchUpStatus: entry.eligible
      ? artifact?.briefing
        ? "completed"
        : "eligible_missing_artifact"
      : "outside_eligibility_day",
    unresolvedFailures,
  });
}
process.stdout.write(`${JSON.stringify({
  schemaVersion: "briefing_cadence_diagnostic_v1",
  readOnly: true,
  inspectedAt: now.toISOString(),
  cadences: status,
}, null, 2)}\n`);

async function latestCompleted(entry) {
  const method = entry.cadence === "midweek"
    ? "getLatestMidweekBriefing"
    : entry.cadence === "weekly"
      ? "getLatestWeeklyBriefing"
      : "getLatestMonthlyBriefing";
  return FounderRepositories.dailyBriefings[method](entry.userId);
}
