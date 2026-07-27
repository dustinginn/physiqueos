import crypto from "node:crypto";
import { FounderRepositories } from "../src/data/repositories/founderRepositories.js";
import { createFounderWeeklyNarrativeService } from "../src/domain/services/WeeklyNarrativeService.js";

const REQUIRED = [
  "target-artifact-id",
  "expected-hash",
  "expected-revision",
  "expected-target-digest",
  "reason",
];

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const missing = REQUIRED.filter((key) => !args[key]);
  if (missing.length) return fail("invalid_request", `Missing required arguments: ${missing.join(", ")}`);
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user?.id) return fail("user_not_found", "Founder user was not found.");

  const service = createFounderWeeklyNarrativeService({ repositories: FounderRepositories });
  const prepared = await service.prepareRegeneration({
    userId: user.id,
    reason: args.reason,
    targetArtifactId: args["target-artifact-id"],
  });
  const priorDigest = semanticDigest(prepared.existing);
  const candidateDigest = semanticDigest(prepared.artifact);
  const expectedRevision = Number(args["expected-revision"]);
  const checks = {
    fileHash: prepared.baseline.fileHash === String(args["expected-hash"]).toUpperCase(),
    revision: prepared.baseline.revision === expectedRevision,
    targetDigest: priorDigest === String(args["expected-target-digest"]).toUpperCase(),
    targetIdentity: prepared.existing.id === args["target-artifact-id"],
    evidenceWindow: prepared.existing.evidenceWindow?.id === "weekly:2026-07-19:2026-07-25:America/Los_Angeles",
    narrativeVersion: prepared.artifact.briefing?.weeklyNarrative?.provenance?.version === "weekly_narrative_v5_2",
  };
  if (Object.values(checks).some((value) => value !== true)) {
    return fail("precondition_failed", "Controlled Weekly regeneration preconditions did not match.", {
      checks, baseline: summarizeBaseline(prepared.baseline), priorDigest, candidateDigest,
    });
  }

  const preparation = summarizeArtifact(prepared.artifact);
  if (args.execute !== true) {
    return output({
      mode: "dry_run",
      status: "prepared",
      checks,
      baseline: summarizeBaseline(prepared.baseline),
      priorDigest,
      candidateDigest,
      preparation,
    });
  }

  const result = await service.executePreparedRegeneration({ prepared });
  output({
    mode: "execute",
    status: result.status,
    committed: result.committed,
    checks,
    baseline: summarizeBaseline(prepared.baseline),
    priorDigest,
    candidateDigest,
    preparation,
    commit: {
      revision: result.revision ?? null,
      commitId: result.commitId ?? null,
      updatedAt: result.updatedAt ?? null,
    },
    error: result.error ?? null,
  });
  if (result.status !== "regenerated") process.exitCode = 1;
}

function summarizeArtifact(artifact) {
  const narrative = artifact?.briefing?.weeklyNarrative;
  const energy = narrative?.cards?.interpretation?.domains?.find((item) => item.domain === "estimated_energy");
  return {
    artifactId: artifact?.id ?? null,
    windowId: artifact?.evidenceWindow?.id ?? null,
    narrativeVersion: narrative?.provenance?.version ?? null,
    activity: narrative?.cards?.progress?.activity ?? null,
    energy: energy ?? null,
    referenceCount: narrative?.references?.length ?? 0,
    goal: narrative?.context?.activeGoalSummary ?? null,
    phase: narrative?.context?.activePhase ?? null,
    operatingState: narrative?.context?.operatingState ?? null,
    recommendation: {
      coachDirection: narrative?.coachDirection ?? null,
      nextWeekFocus: narrative?.nextWeekFocus ?? null,
    },
    piMemory: artifact?.piMemory ? {
      schemaVersion: artifact.piMemory.schemaVersion,
      cadence: artifact.piMemory.cadence,
      briefingDate: artifact.piMemory.briefingDate,
      communicatedClaimIds: artifact.piMemory.communicatedClaimIds,
      claimHistoryCount: artifact.piMemory.claimHistory?.length ?? 0,
      priorClaimCount: artifact.piMemory.priorClaims?.length ?? 0,
      limitations: artifact.piMemory.limitations,
    } : null,
  };
}

function summarizeBaseline(baseline) {
  return {
    fileHash: baseline.fileHash,
    semanticDigest: baseline.semanticDigest,
    revision: baseline.revision,
    lastCommitId: baseline.lastCommitId,
    updatedAt: baseline.updatedAt,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--execute") { result.execute = true; continue; }
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) continue;
    result[key] = value;
    index += 1;
  }
  return result;
}

function semanticDigest(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").toUpperCase();
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return value;
}

function fail(status, message, details = null) {
  output({ mode: "dry_run", status, committed: false, error: { code: status, message }, details });
  process.exitCode = 1;
}

main().catch((error) => {
  output({
    status: "execution_failure",
    committed: Boolean(error?.committed),
    error: { code: error?.code ?? "unknown_error", message: String(error?.message ?? error) },
  });
  process.exitCode = 1;
});
