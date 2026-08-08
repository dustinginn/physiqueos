import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseOperationalJsonBytes } from "./lib/operationalJson.mjs";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../src/data/repositories/founderRuntimeStore.js";
import {
  createFounderRuntimeSemanticDigest,
} from "../src/domain/services/FounderRuntimeSemanticDigest.js";
import {
  createPIGoalConfidencePersistenceService,
} from "../src/domain/services/PIGoalConfidencePersistenceService.js";
import {
  createPIGoalConfidenceReadService,
} from "../src/domain/services/PIGoalConfidenceReadService.js";
import {
  createPIGoalConfidenceRefreshService,
} from "../src/domain/services/PIGoalConfidenceRefreshService.js";

export const CONTROLLED_GOAL_ID =
  "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass";
export const CONTROLLED_PHASE_ID =
  "goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08";

export async function runControlledReconciliation(options = {}) {
  const filePath = options.filePath ?? resolveFounderRuntimeStorePath();
  const raw = fs.readFileSync(filePath, "utf8");
  const store = parseOperationalJsonBytes(Buffer.from(raw),
    { filePath, stage: "pi_goal_confidence_reconciliation_source" });
  const baseline = {
    hash: sha(raw),
    semanticDigest: createFounderRuntimeSemanticDigest(store),
    revision: store.revision,
    lastCommitId: store.lastCommitId,
    size: Buffer.byteLength(raw),
  };
  validateExactScope(options, store, baseline);
  const prepared = prepareCurrentPI(store);
  const liveStore = options.liveStore ?? (
    filePath === resolveFounderRuntimeStorePath() ? getFounderRuntimeStore() : store
  );
  const persistence = options.persistenceService ??
    createPIGoalConfidencePersistenceService({ filePath, liveStore });
  const readService = createPIGoalConfidenceReadService({ store });
  let publicationCommand = null;
  const publication = options.execute
    ? persistence
    : { publish: async (command) => {
      publicationCommand = command;
      return {
        status: "published", committed: false, dryRun: true,
        snapshotId: "dry_run", historyRecordId: "dry_run",
      };
    } };
  const refresh = createPIGoalConfidenceRefreshService({
    readService, persistenceService: publication,
    now: () => new Date(options.generatedAt),
  });
  let backup = null;
  if (options.execute) backup = createVerifiedBackup(filePath, raw, baseline);
  const result = await refresh.refresh({
    triggerType: "controlled_reconciliation",
    triggerId: options.triggerId,
    publicationReason: options.publicationReason,
    goalContext: {
      goalId: CONTROLLED_GOAL_ID, semanticGoalType: "build_lean_mass",
    },
    phaseContext: {
      phaseId: CONTROLLED_PHASE_ID, semanticPhaseType: "establish_maintenance",
    },
    operatingState: "calibration",
    assessmentContext: {},
    evidenceCutoff: prepared.evidenceCutoff,
    generatedAt: options.generatedAt,
    piVersion: "pi_v3",
    confidenceModelVersion: "pi_goal_confidence_scoring_v1",
    expectedRevision: baseline.revision,
    expectedSemanticDigest: baseline.semanticDigest,
    expectedCurrentSnapshot: null,
    preparedPIReasoning: prepared,
    legacyContinuitySeedAuthorization: true,
    legacyContinuityScore: 44,
    legacySourceTimestamp: options.legacySourceTimestamp,
    legacySourceFingerprint: options.legacySourceFingerprint,
  });
  return {
    mode: options.execute ? "execute" : "dry_run",
    baseline, backup, prepared: summarizePrepared(prepared),
    result, publicationCommand,
  };
}

export function prepareCurrentPI(store) {
  const weekly = [...(store.dailyBriefings ?? [])].reverse().find((item) =>
    item.id?.startsWith("weekly_briefing_"));
  const pi = weekly?.briefing?.weeklyNarrative?.context?.pi;
  if (!pi?.observations?.length) throw new Error("Current Weekly PI envelope is unavailable.");
  const by = (domain) => pi.observations.filter((item) => item.domain === domain);
  const training = by("training");
  const photos = by("photos");
  const weightDirections = new Set(by("weight").map((item) => item.direction));
  const limitations = pi.limitations ?? [];
  return {
    publicationEligible: true, semanticChange: true,
    completenessImproved: true,
    piReasoningFingerprint: `sha256_${sha(JSON.stringify(pi))}`,
    piDecisionResultId: weekly.id,
    evidenceCutoff: `${pi.observations[0].evidenceWindow.endDate}T23:59:59.999-07:00`,
    domainStates: {
      training: {
        status: training.filter((item) =>
          item.subject?.type === "training_category" &&
          item.status === "improving").length >= 3
          ? "broad_constructive" : "stable",
        sourceObservationIds: training.map((item) => item.id),
      },
      energy: {
        status: limitations.some((item) => item.includes("paired_coverage"))
          ? "incomplete" : "unknown",
        sourceObservationIds: by("energy").map((item) => item.id),
      },
      weight: {
        status: weightDirections.has("rising") && weightDirections.has("falling")
          ? "volatile" : "unknown",
        sourceObservationIds: by("weight").map((item) => item.id),
      },
      photos: {
        status: photos.some((item) => item.status === "stable")
          ? "stable" : "inconclusive",
        sourceObservationIds: photos.map((item) => item.id),
      },
      dexa: { status: "historical_baseline" },
      recovery: {
        status: "unknown",
        sourceObservationIds: by("recovery").map((item) => item.id),
      },
    },
    evidenceCompleteness: { overall: "partial" },
    reasoning: {
      observationSemantics: pi.observations,
      claimSemantics: [],
      limitations: [...limitations, "maintenance_target_state_not_normalized"],
      contradictions: [],
      domainInterpretations: [],
      authoritativeMeasurement: null,
    },
  };
}

function validateExactScope(options, store, baseline) {
  for (const [actual, expected, label] of [
    [options.goalId, CONTROLLED_GOAL_ID, "goal ID"],
    [options.phaseId, CONTROLLED_PHASE_ID, "phase ID"],
    [options.operatingState, "calibration", "operating state"],
    [options.expectedHash, baseline.hash, "runtime hash"],
    [options.expectedSemanticDigest, baseline.semanticDigest, "semantic digest"],
    [Number(options.expectedRevision), baseline.revision, "revision"],
    [Number(options.legacyContinuityScore), 44, "legacy score"],
    [options.legacySourceModel, "overall_goal_confidence_v1", "legacy model"],
  ]) if (actual !== expected) throw new Error(`Controlled ${label} guard failed.`);
  const goal = store.goals?.find((item) =>
    item.id === CONTROLLED_GOAL_ID && item.status === "active" && item.primary);
  const phase = goal?.phases?.find((item) =>
    item.id === CONTROLLED_PHASE_ID && item.status === "active");
  if (!goal || !phase || goal.openingApproach?.value !== "calibration") {
    throw new Error("Controlled Goal boundary is not active.");
  }
  if ((store.goalConfidenceSnapshots?.length ?? 0) !== 0 ||
      (store.goalConfidenceHistory?.length ?? 0) !== 0 ||
      (store.goalConfidenceContinuitySeeds?.length ?? 0) !== 0) {
    throw new Error("Controlled confidence boundary is not empty.");
  }
  if (options.execute !== true && options.execute !== false) {
    throw new Error("Execution mode must be explicit.");
  }
}
function createVerifiedBackup(filePath, raw, baseline) {
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
  const backupPath = path.join(path.dirname(filePath),
    `runtime-store.pre-pi-confidence-reconciliation.${stamp}.json`);
  fs.copyFileSync(filePath, backupPath);
  const copied = fs.readFileSync(backupPath);
  if (sha(copied) !== baseline.hash || copied.length !== baseline.size) {
    throw new Error("Founder backup verification failed.");
  }
  return { path: backupPath, hash: baseline.hash, size: copied.length,
    revision: baseline.revision, lastCommitId: baseline.lastCommitId };
}
function summarizePrepared(value) {
  return {
    evidenceCutoff: value.evidenceCutoff,
    piReasoningFingerprint: value.piReasoningFingerprint,
    domainStates: Object.fromEntries(Object.entries(value.domainStates)
      .map(([key, item]) => [key, item.status])),
    evidenceCompleteness: value.evidenceCompleteness,
    limitations: value.reasoning.limitations,
  };
}
function sha(value) { return createHash("sha256").update(value).digest("hex").toUpperCase(); }
function args(argv) {
  const result = { execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--execute") result.execute = true;
    else if (item.startsWith("--")) {
      const key = item.slice(2).replace(/-([a-z])/g, (_, letter) =>
        letter.toUpperCase());
      result[key] = argv[++index];
    }
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runControlledReconciliation(args(process.argv.slice(2)))
    .then((output) => {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      if (!["published_reconciliation", "published_initial"].includes(output.result.status)) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ status: "failed", error: error.message })}\n`);
      process.exitCode = 1;
    });
}
