import crypto from "node:crypto";
import fs from "node:fs";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../data/repositories/founderRuntimeStore";

export const WeeklyPersistenceOutcome = Object.freeze({
  CREATED: "created",
  REGENERATED: "regenerated",
  MATCHED: "matched",
  BASELINE_CONFLICT: "baseline_conflict",
  CONCURRENCY_CONFLICT: "concurrency_conflict",
  SEMANTIC_CONFLICT: "semantic_conflict",
  VALIDATION_FAILURE: "validation_failure",
  PERSISTENCE_FAILURE: "persistence_failure",
});

export function createFounderWeeklyBriefingPersistenceService(options = {}) {
  const filePath = options.filePath ?? resolveFounderRuntimeStorePath();
  const liveStore = options.liveStore ?? getFounderRuntimeStore();
  const readText = options.readText ?? ((target) => fs.readFileSync(target, "utf8"));
  const unitOfWorkFactory = options.unitOfWorkFactory ?? createFounderStoreUnitOfWork;
  const now = options.now ?? (() => new Date());

  return {
    captureBaseline() {
      return capture(filePath, readText);
    },

    async commit(prepared = {}) {
      const contractError = validateContract(prepared);
      if (contractError) return failure(WeeklyPersistenceOutcome.VALIDATION_FAILURE, contractError);

      let authoritative;
      try {
        authoritative = capture(filePath, readText);
      } catch (error) {
        return failure(WeeklyPersistenceOutcome.PERSISTENCE_FAILURE, error);
      }
      if (!matchesBaseline(authoritative, prepared.baseline)) {
        return failure(WeeklyPersistenceOutcome.BASELINE_CONFLICT, "Founder runtime changed after Weekly preparation.");
      }

      const existing = findOccurrence(authoritative.store, prepared);
      const preflight = classifyTarget(existing, prepared);
      if (preflight) return preflight;

      const unit = unitOfWorkFactory({
        filePath,
        liveStore,
        stageFrom: authoritative.store,
        now,
        validatePersistedBaseline: (current) => ({
          valid:
            getFounderStoreRevision(current) === prepared.baseline.revision &&
            semanticDigest(current) === prepared.baseline.semanticDigest,
        }),
        ...(options.unitOfWorkOptions ?? {}),
      });
      const transaction = unit.begin();
      try {
        await transaction.mutate(async (candidate) => {
          const targetBefore = findOccurrence(candidate, prepared);
          const stagedCheck = classifyTarget(targetBefore, prepared);
          if (stagedCheck?.status === WeeklyPersistenceOutcome.MATCHED) {
            throw typedError("WEEKLY_TARGET_MATCHED", "Weekly target was already committed.");
          }
          if (stagedCheck) {
            throw typedError("WEEKLY_SEMANTIC_CONFLICT", stagedCheck.error.message);
          }
          await createDailyBriefingRepository(candidate.dailyBriefings).createDailyBriefing(
            structuredClone(prepared.artifact),
            { replacementReason: prepared.reason }
          );
        });
        const committed = await transaction.commit({
          validate: (candidate) => validateCandidate(candidate, prepared),
          validateFinalized: (candidate) => validateFinalizedCandidate(candidate, prepared),
        });
        return {
          status: prepared.operation === "regeneration"
            ? WeeklyPersistenceOutcome.REGENERATED
            : WeeklyPersistenceOutcome.CREATED,
          artifact: structuredClone(prepared.artifact),
          revision: committed.revision,
          commitId: committed.commitId,
          updatedAt: liveStore.updatedAt,
          committed: true,
        };
      } catch (error) {
        if (error?.code === "WEEKLY_TARGET_MATCHED") {
          return { status: WeeklyPersistenceOutcome.MATCHED, artifact: existing, committed: false };
        }
        if (error?.code === "WEEKLY_SEMANTIC_CONFLICT") {
          return failure(WeeklyPersistenceOutcome.SEMANTIC_CONFLICT, error);
        }
        if (error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT) {
          return failure(WeeklyPersistenceOutcome.CONCURRENCY_CONFLICT, error);
        }
        if (
          error?.code === FounderStoreUnitOfWorkErrorCode.VALIDATION_FAILED &&
          !matchesCurrentBaseline(filePath, readText, prepared.baseline)
        ) {
          return failure(WeeklyPersistenceOutcome.BASELINE_CONFLICT, error);
        }
        if (error?.code === FounderStoreUnitOfWorkErrorCode.VALIDATION_FAILED) {
          return failure(WeeklyPersistenceOutcome.VALIDATION_FAILURE, error);
        }
        return failure(WeeklyPersistenceOutcome.PERSISTENCE_FAILURE, error);
      }
    },
  };
}

// Midweek uses the same canonical Founder unit-of-work and replacement-history
// contract. The prepared-commit validator below keeps the cadence/version
// boundary explicit.
export function createFounderMidweekBriefingPersistenceService(options = {}) {
  return createFounderWeeklyBriefingPersistenceService(options);
}

export function createWeeklyPreparedCommit({
  operation,
  artifact,
  baseline,
  expectedExistingArtifact = null,
  reason = null,
} = {}) {
  return {
    schemaVersion: "weekly_prepared_commit_v1",
    operation,
    artifact,
    artifactId: artifact?.id ?? null,
    cadence: artifact?.cadence ?? null,
    evidenceWindowId: artifact?.evidenceWindow?.id ?? null,
    briefingDate: artifact?.evidenceWindow?.briefingDate ?? null,
    timeZone: artifact?.evidenceWindow?.timeZone ?? null,
    narrativeVersion:
      artifact?.briefing?.weeklyNarrative?.provenance?.version ??
      artifact?.briefing?.version ??
      null,
    piMemory: artifact?.piMemory ?? null,
    lifecycle: artifact?.lifecycle ?? null,
    baseline,
    expectedExistingArtifactId: expectedExistingArtifact?.id ?? null,
    expectedExistingArtifactDigest: expectedExistingArtifact
      ? semanticDigest(expectedExistingArtifact)
      : null,
    replacementAuthorized: operation === "regeneration" && Boolean(reason),
    reason,
    idempotencyKey: `${operation}:${artifact?.id ?? "unknown"}:${artifact?.evidenceWindow?.id ?? "unknown"}`,
  };
}

export function createMidweekPreparedCommit(input = {}) {
  const prepared = createWeeklyPreparedCommit(input);
  return {
    ...prepared,
    schemaVersion: "midweek_prepared_commit_v1",
    cadence: "midweek",
    narrativeVersion: input.artifact?.briefing?.version ?? null,
  };
}

function capture(filePath, readText) {
  const raw = readText(filePath);
  const store = JSON.parse(raw);
  return Object.freeze({
    revision: getFounderStoreRevision(store),
    lastCommitId: store.lastCommitId ?? null,
    updatedAt: store.updatedAt ?? null,
    fileHash: digest(raw),
    semanticDigest: semanticDigest(store),
    store,
  });
}

function matchesCurrentBaseline(filePath, readText, baseline) {
  try {
    return matchesBaseline(capture(filePath, readText), baseline);
  } catch {
    return false;
  }
}

function matchesBaseline(current, expected = {}) {
  return current.revision === expected.revision &&
    current.semanticDigest === expected.semanticDigest &&
    (!expected.fileHash || current.fileHash === expected.fileHash);
}

function classifyTarget(existing, prepared) {
  if (prepared.operation === "regeneration") {
    if (!existing) return failure(WeeklyPersistenceOutcome.SEMANTIC_CONFLICT, "Weekly regeneration target is missing.");
    if (
      existing.id !== prepared.expectedExistingArtifactId ||
      semanticDigest(existing) !== prepared.expectedExistingArtifactDigest
    ) {
      return failure(WeeklyPersistenceOutcome.SEMANTIC_CONFLICT, "Weekly regeneration target changed after preparation.");
    }
    return null;
  }
  if (!existing) return null;
  return sameOccurrence(existing, prepared.artifact)
    ? { status: WeeklyPersistenceOutcome.MATCHED, artifact: structuredClone(existing), committed: false }
    : failure(WeeklyPersistenceOutcome.SEMANTIC_CONFLICT, "A conflicting Weekly artifact owns the requested occurrence.");
}

function validateContract(prepared) {
  const expectedCadence = prepared.schemaVersion === "weekly_prepared_commit_v1"
    ? "weekly"
    : prepared.schemaVersion === "midweek_prepared_commit_v1"
      ? "midweek"
      : null;
  if (!expectedCadence) return "Unsupported briefing prepared-commit contract.";
  if (!["normal_generation", "catch_up", "regeneration"].includes(prepared.operation)) return "Unsupported Weekly operation.";
  if (!prepared.artifact || prepared.artifactId !== prepared.artifact.id) return "Prepared Weekly artifact identity is invalid.";
  if (prepared.cadence !== expectedCadence || prepared.artifact.cadence !== expectedCadence || prepared.artifact.artifactType !== "scheduled") return "Prepared artifact cadence is invalid.";
  if (!prepared.evidenceWindowId || prepared.evidenceWindowId !== prepared.artifact.evidenceWindow?.id) return "Weekly evidence-window identity is invalid.";
  if (!prepared.briefingDate || !prepared.timeZone) return "Weekly briefing date and timezone are required.";
  if (
    (expectedCadence === "weekly" && prepared.narrativeVersion !== "weekly_narrative_v5_2") ||
    (expectedCadence === "midweek" && prepared.narrativeVersion !== "midweek_briefing_v1")
  ) return "Prepared briefing narrative version is invalid.";
  if (!prepared.baseline?.semanticDigest || !Number.isSafeInteger(prepared.baseline?.revision)) return "Authoritative Founder baseline is required.";
  if (prepared.operation === "regeneration" && !prepared.replacementAuthorized) return "Weekly regeneration requires an explicit reason.";
  return null;
}

function validateCandidate(candidate, prepared) {
  const matches = occurrenceMatches(candidate, prepared);
  if (
    matches.length !== 1 ||
    semanticDigest(withoutReplacementHistory(matches[0])) !==
      semanticDigest(withoutReplacementHistory(prepared.artifact))
  ) {
    return { valid: false };
  }
  if (
    prepared.operation === "regeneration" &&
    !(matches[0].replacedBriefingHistory ?? []).some(
      (entry) => entry.artifact?.id === prepared.expectedExistingArtifactId ||
        entry.artifactId === prepared.expectedExistingArtifactId ||
        entry.id === prepared.expectedExistingArtifactId
    )
  ) return { valid: false };
  return { valid: true };
}

function validateFinalizedCandidate(candidate, prepared) {
  if (candidate.revision !== prepared.baseline.revision + 1) return { valid: false };
  if (!candidate.lastCommitId || candidate.lastCommitId === prepared.baseline.lastCommitId) return { valid: false };
  if (!candidate.updatedAt || candidate.updatedAt === prepared.baseline.updatedAt) return { valid: false };
  return validateCandidate(candidate, prepared);
}

function findOccurrence(store, prepared) {
  return occurrenceMatches(store, prepared)[0] ?? null;
}

function occurrenceMatches(store, prepared) {
  return (store.dailyBriefings ?? []).filter((item) =>
    item.id === prepared.artifactId ||
    (
      item.userId === prepared.artifact.userId &&
      item.cadence === prepared.cadence &&
      item.evidenceWindow?.id === prepared.evidenceWindowId
    )
  );
}

function sameOccurrence(left, right) {
  return left?.id === right?.id &&
    left?.userId === right?.userId &&
    left?.cadence === right?.cadence &&
    left?.artifactType === "scheduled" &&
    left?.evidenceWindow?.id === right?.evidenceWindow?.id &&
    left?.evidenceWindow?.startDate === right?.evidenceWindow?.startDate &&
    left?.evidenceWindow?.endDate === right?.evidenceWindow?.endDate &&
    left?.evidenceWindow?.briefingDate === right?.evidenceWindow?.briefingDate;
}

function withoutReplacementHistory(artifact = {}) {
  const { replacedBriefingHistory: _history, ...rest } = artifact;
  return rest;
}

function semanticDigest(value) {
  return digest(stableSerialize(value));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
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

function failure(status, error) {
  const normalized = typeof error === "string" ? new Error(error) : error;
  return {
    status,
    committed: false,
    error: {
      code: normalized?.code ?? status,
      message: String(normalized?.message ?? normalized),
    },
  };
}

function typedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
