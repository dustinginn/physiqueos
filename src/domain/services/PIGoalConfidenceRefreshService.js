import { createHash } from "node:crypto";
import {
  mapPIGoalConfidenceContributors,
} from "./PIGoalConfidenceContributorMapper";
import {
  PIGoalConfidenceScoringService,
} from "./PIGoalConfidenceScoringService";
import {
  createPIGoalConfidenceContinuitySeed,
} from "./PIGoalConfidencePersistenceService";

export const PI_GOAL_CONFIDENCE_REFRESH_VERSION =
  "pi_goal_confidence_refresh_v1";

export const PIGoalConfidenceTriggerType = Object.freeze({
  EVIDENCE_CONFIRMATION: "evidence_confirmation",
  TRAINING_PERFORMANCE_UPDATE: "training_performance_update",
  MIDWEEK_ASSESSMENT: "midweek_assessment",
  WEEKLY_ASSESSMENT: "weekly_assessment",
  PHOTO_EVENT: "photo_event",
  DEXA_EVENT: "dexa_event",
  PHASE_TRANSITION: "phase_transition",
  CONTROLLED_RECONCILIATION: "controlled_reconciliation",
});

export const PIGoalConfidenceRefreshOutcome = Object.freeze({
  PUBLISHED_INITIAL: "published_initial",
  PUBLISHED_SUCCESSOR: "published_successor",
  PUBLISHED_RECONCILIATION: "published_reconciliation",
  MATCHED: "matched",
  NOT_ELIGIBLE: "not_eligible",
  UNSUPPORTED_CONTEXT: "unsupported_context",
  INCOMPLETE_PI_INPUT: "incomplete_pi_input",
  STALE_TRIGGER: "stale_trigger",
  CONTEXT_PRECEDENCE_BLOCKED: "context_precedence_blocked",
  BASELINE_CONFLICT: "baseline_conflict",
  SNAPSHOT_CONFLICT: "snapshot_conflict",
  SEMANTIC_CONFLICT: "semantic_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure",
});

const CONTEXT = Object.freeze({
  evidence_confirmation: ["current_active_goal", 2],
  training_performance_update: ["current_active_goal", 2],
  midweek_assessment: ["midweek_partial_window", 3],
  weekly_assessment: ["weekly_closed_window", 4],
  photo_event: ["photo_event", 1],
  dexa_event: ["dexa_event", 5],
  phase_transition: ["phase_transition", 6],
  controlled_reconciliation: ["controlled_reconciliation", 7],
});
const CONTEXT_PRECEDENCE = Object.freeze({
  photo_event: 1, current_active_goal: 2, midweek_partial_window: 3,
  weekly_closed_window: 4, dexa_event: 5, phase_transition: 6,
  controlled_reconciliation: 7,
});

export function createPIGoalConfidenceRefreshService({
  readService,
  persistenceService,
  mapper = mapPIGoalConfidenceContributors,
  scoringService = PIGoalConfidenceScoringService,
  now = () => new Date(),
} = {}) {
  if (!readService || !persistenceService) {
    throw new Error("Goal-confidence read and persistence services are required.");
  }
  return Object.freeze({
    async refresh(request = {}) {
      const trigger = normalizeTrigger(request);
      if (!trigger.ok) return result(trigger.status, request);
      let prepared;
      try {
        prepared = request.preparedPIReasoning ??
          await request.preparePIReasoning?.(Object.freeze({
            triggerType: request.triggerType,
            triggerId: request.triggerId,
            evidenceCutoff: request.evidenceCutoff,
          }));
      } catch (error) {
        return result(PIGoalConfidenceRefreshOutcome.INCOMPLETE_PI_INPUT, request, { error });
      }
      if (!prepared?.domainStates || !prepared?.evidenceCompleteness) {
        return result(PIGoalConfidenceRefreshOutcome.INCOMPLETE_PI_INPUT, request);
      }
      if (prepared.publicationEligible === false || prepared.semanticChange === false) {
        return result(PIGoalConfidenceRefreshOutcome.NOT_ELIGIBLE, request);
      }

      let mapped;
      try {
        mapped = mapper({
          goalContext: request.goalContext,
          phaseContext: request.phaseContext,
          operatingState: request.operatingState,
          assessmentContext: trigger.assessmentContext,
          evidenceWindow: request.evidenceWindow,
          domainStates: prepared.domainStates,
          evidenceCompleteness: prepared.evidenceCompleteness,
          observations: prepared.observations,
          claims: prepared.claims,
        });
      } catch (error) {
        return result(PIGoalConfidenceRefreshOutcome.SEMANTIC_CONFLICT, request, { error });
      }
      if (mapped.status !== "mapped") {
        return result(PIGoalConfidenceRefreshOutcome.UNSUPPORTED_CONTEXT, request);
      }

      const receipt = createPIGoalConfidenceRefreshReceipt({
        ...request,
        assessmentContext: trigger.assessmentContext,
        piReasoningFingerprint: prepared.piReasoningFingerprint ??
          fingerprint(prepared),
      });
      const series = readService.getGoalConfidenceSeries({
        goalId: request.goalContext.goalId,
        phaseId: request.phaseContext.phaseId,
      });
      const triggerMarker = `[trigger:${request.triggerType}:${request.triggerId}]`;
      const priorTriggerRecord = series.history.find((item) =>
        item.publicationReason?.includes(triggerMarker));
      if (priorTriggerRecord &&
          !priorTriggerRecord.publicationReason.includes(receipt.id)) {
        return result(PIGoalConfidenceRefreshOutcome.SEMANTIC_CONFLICT, request, {
          receipt,
        });
      }
      if (priorTriggerRecord?.publicationReason.includes(receipt.id)) {
        return result(PIGoalConfidenceRefreshOutcome.MATCHED, request, {
          receipt,
          assessmentId: priorTriggerRecord.assessmentId,
          assessment: priorTriggerRecord.assessment,
          score: priorTriggerRecord.assessment?.score ?? null,
          contributors: priorTriggerRecord.assessment?.contributors ?? [],
          confidenceReason: priorTriggerRecord.assessment?.primaryReason ?? null,
          snapshotId: series.currentSnapshot?.id ?? null,
          historyRecordId: priorTriggerRecord.id ?? null,
          publication: { status: "matched", committed: false },
        });
      }
      const prior = resolvePrior(series, request);
      if (prior.error) return result(prior.error, request);
      if (isStale(series.currentSnapshot, request.evidenceCutoff)) {
        return result(PIGoalConfidenceRefreshOutcome.STALE_TRIGGER, request);
      }
      if (!mayReplace(series.currentSnapshot, trigger, request, prepared)) {
        return result(PIGoalConfidenceRefreshOutcome.CONTEXT_PRECEDENCE_BLOCKED, request);
      }

      let scored;
      try {
        scored = scoringService.score({
          goalContext: request.goalContext,
          phaseContext: request.phaseContext,
          operatingState: request.operatingState,
          assessmentContext: trigger.assessmentContext,
          evidenceCutoff: request.evidenceCutoff,
          generatedAt: request.generatedAt ?? now().toISOString(),
          piVersion: request.piVersion,
          evidenceCompleteness: prepared.evidenceCompleteness,
          contributors: mapped.contributors,
          mapperTrace: mapped.trace,
          reasoning: prepared.reasoning,
          piDecisionResultId: prepared.piDecisionResultId,
          priorScore: prior.score,
          priorScoreProvenance: prior.provenance,
        });
      } catch (error) {
        return result(PIGoalConfidenceRefreshOutcome.SEMANTIC_CONFLICT, request, { error });
      }
      // The persistence contract models a seeded first publication as an
      // initial write carrying a continuity seed. "publish_reconciliation"
      // is reserved for replacing an existing canonical snapshot.
      const operation = series.canonicalSeriesExists
        ? "publish_successor" : "publish_initial";
      const publication = await persistenceService.publish({
        operation,
        assessment: scored.assessment,
        expectedRevision: request.expectedRevision,
        expectedSemanticDigest: request.expectedSemanticDigest,
        expectedCurrentSnapshot: request.expectedCurrentSnapshot ??
          series.currentSnapshot ?? null,
        publicationReason:
          `${request.publicationReason} ${triggerMarker} [${receipt.id}]`,
        replacementAuthorized: operation !== "publish_initial",
        continuitySeed: prior.seed,
      });
      const status = publicationStatus(publication.status, operation, Boolean(prior.seed));
      return result(status, request, {
        receipt,
        assessmentId: scored.assessment.id,
        score: scored.score,
        contributors: scored.assessment.contributors,
        confidenceReason: scored.primaryReason,
        assessment: scored.assessment,
        trace: scored.trace,
        publication,
        snapshotId: publication.snapshotId ?? series.currentSnapshot?.id ?? null,
        historyRecordId: publication.historyRecordId ?? null,
      });
    },
  });
}

export function createPIGoalConfidenceRefreshReceipt(input = {}) {
  const semantic = {
    triggerType: input.triggerType, triggerId: input.triggerId,
    goalId: input.goalContext?.goalId, phaseId: input.phaseContext?.phaseId,
    operatingState: input.operatingState,
    assessmentContext: input.assessmentContext,
    evidenceWindowId: input.evidenceWindow?.id ??
      input.assessmentContext?.evidenceWindowId ?? null,
    evidenceCutoff: new Date(input.evidenceCutoff).toISOString(),
    piReasoningFingerprint: input.piReasoningFingerprint,
    confidenceModelVersion: input.confidenceModelVersion ??
      "pi_goal_confidence_scoring_v1",
  };
  return Object.freeze({
    schemaVersion: "pi_goal_confidence_refresh_receipt_v1",
    id: `pi_goal_confidence_refresh|${hash(stable(semantic))}`,
    ...semantic,
  });
}

function normalizeTrigger(request) {
  const config = CONTEXT[request.triggerType];
  if (!config || !request.triggerId || !request.publicationReason) {
    return { ok: false, status: PIGoalConfidenceRefreshOutcome.UNSUPPORTED_CONTEXT };
  }
  const context = request.assessmentContext ?? {};
  return {
    ok: true,
    precedence: config[1],
    assessmentContext: {
      type: config[0],
      cadence: context.cadence ?? null,
      evidenceWindowId: context.evidenceWindowId ?? request.evidenceWindow?.id ?? null,
      eventId: context.eventId ?? (
        ["photo_event", "dexa_event"].includes(config[0]) ? request.triggerId : null
      ),
    },
  };
}
function resolvePrior(series, request) {
  if (series.canonicalSeriesExists) return {
    score: series.latestCanonicalAssessment.score.current,
    provenance: {
      source: "canonical_pi_assessment",
      assessmentId: series.latestCanonicalAssessment.id,
      modelVersion: series.latestCanonicalAssessment.modelVersion,
    },
  };
  if (request.legacyContinuitySeedAuthorization !== true) return { score: null };
  if (request.triggerType !== PIGoalConfidenceTriggerType.CONTROLLED_RECONCILIATION) {
    return { error: PIGoalConfidenceRefreshOutcome.SEMANTIC_CONFLICT };
  }
  const seed = series.continuitySeed ?? createPIGoalConfidenceContinuitySeed({
    goalId: request.goalContext.goalId, phaseId: request.phaseContext.phaseId,
    operatingState: request.operatingState, score: request.legacyContinuityScore,
    sourceTimestamp: request.legacySourceTimestamp,
    reconciliationTimestamp: request.generatedAt,
    createdAt: request.generatedAt,
    sourceFingerprint: request.legacySourceFingerprint,
  });
  return {
    score: seed.score, seed,
    provenance: { source: "controlled_reconciliation_seed", assessmentId: seed.id,
      modelVersion: seed.sourceModel },
  };
}
function mayReplace(snapshot, trigger, request, prepared) {
  if (!snapshot) return true;
  const currentCutoff = Date.parse(snapshot.evidenceCutoff ?? 0);
  const nextCutoff = Date.parse(request.evidenceCutoff);
  if (nextCutoff > currentCutoff && prepared.semanticChange === true) return true;
  const currentRank = CONTEXT_PRECEDENCE[snapshot.assessmentContext?.type] ?? 0;
  return nextCutoff >= currentCutoff && trigger.precedence >= currentRank &&
    prepared.completenessImproved === true;
}
function isStale(snapshot, cutoff) {
  return Boolean(snapshot?.evidenceCutoff) &&
    Date.parse(cutoff) < Date.parse(snapshot.evidenceCutoff);
}
function publicationStatus(status, operation, seededReconciliation = false) {
  if (status === "matched") return PIGoalConfidenceRefreshOutcome.MATCHED;
  if (status === "published" && seededReconciliation) {
    return PIGoalConfidenceRefreshOutcome.PUBLISHED_RECONCILIATION;
  }
  if (status === "published") return operation === "publish_initial"
    ? PIGoalConfidenceRefreshOutcome.PUBLISHED_INITIAL
    : operation === "publish_reconciliation"
      ? PIGoalConfidenceRefreshOutcome.PUBLISHED_RECONCILIATION
      : PIGoalConfidenceRefreshOutcome.PUBLISHED_SUCCESSOR;
  if (["revision_conflict", "runtime_digest_conflict"].includes(status)) {
    return PIGoalConfidenceRefreshOutcome.BASELINE_CONFLICT;
  }
  if (status === "snapshot_state_conflict") return PIGoalConfidenceRefreshOutcome.SNAPSHOT_CONFLICT;
  if (status === "committed_publication_failure") {
    return PIGoalConfidenceRefreshOutcome.COMMITTED_PUBLICATION_FAILURE;
  }
  return status?.includes("conflict")
    ? PIGoalConfidenceRefreshOutcome.SEMANTIC_CONFLICT
    : PIGoalConfidenceRefreshOutcome.PERSISTENCE_FAILURE;
}
function result(status, request, extra = {}) {
  return Object.freeze({
    status, triggerType: request.triggerType ?? null,
    triggerId: request.triggerId ?? null, ...extra,
  });
}
function fingerprint(value) { return `sha256_${hash(stable(value))}`; }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
}
