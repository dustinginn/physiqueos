import { describe, expect, it } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from "../confidence/BriefingForecastFinalizer";
import { ConfidencePublisherRegistry } from "../confidence/ConfidencePublisherRegistry";
import { createCanonicalBriefingConfidencePublicationService } from "./CanonicalBriefingConfidencePublicationService";
import { buildEvidenceSettlementWatermarkV1, evaluateBriefingReadinessV1 } from "./BriefingEvidenceSettlementPolicy.js";
import { freezeStoredEvidenceSettlement } from "./BriefingEvidenceSettlementArtifact.js";

// The canonical PUBLICATION path under two concurrent workers: the real
// CanonicalBriefingConfidencePublicationService + real finalizer over an in-memory
// canonical store whose bounded `mutateCanonicalRuntime` is SERIALIZED (each
// transaction runs alone, like Postgres serializing the same rows), which is the
// property the deployed store provides. This is NOT a real-Postgres test (see the
// limitation stated in BriefingCadenceConcurrency.test.js).

const watermark = (reasonCode, unsettled, generatedAt) => buildEvidenceSettlementWatermarkV1({
  evidenceWindow: { id: "weekly-window", startDate: "2026-07-01", endDate: "2026-07-31", cadence: "weekly" },
  readiness: evaluateBriefingReadinessV1({ domainStates: {} }),
  publishDecision: { reasonCode, unsettledDomains: unsettled }, generatedAt, cadence: "weekly",
  timeZone: "America/Los_Angeles", timeZoneAuthority: "briefing_schedule_authority",
});

function setup() {
  const prior = {
    schemaVersion: "pi_goal_confidence_assessment_v1",
    id: "prior-assessment", goalId: "goal_build_muscle", phaseId: "phase-one",
    operatingState: "calibration", evidenceCutoff: "2026-06-30T23:59:59.999Z",
    score: { current: 55, prior: 50, band: "developing", movement: { direction: "held", magnitude: "none" } },
    contributors: [], unresolvedUncertainty: [], primaryReason: "Prior V1 context.",
    provenance: { generatedAt: "2026-07-01T00:00:00.000Z" },
  };
  const liveStore = {
    revision: 7, updatedAt: "2026-07-01T00:00:00.000Z", lastCommitId: "prior-commit",
    dailyBriefings: [], confidenceInitializationArtifacts: [], confidenceActivationArtifacts: [],
    goalConfidenceHistory: [{ id: "prior-history", assessmentId: prior.id, goalId: prior.goalId, phaseId: prior.phaseId,
      persistedAt: prior.provenance.generatedAt, assessment: prior }],
    goalConfidenceSnapshots: [{ id: "prior-snapshot", goalId: prior.goalId, phaseId: prior.phaseId,
      currentAssessmentId: prior.id, currentScore: prior.score.current, scoreBand: prior.score.band, historyRecordId: "prior-history" }],
    goalConfidenceContinuitySeeds: [], replacedBriefingHistory: [],
  };
  const transactions = [];
  let tail = Promise.resolve();
  const mutateCanonicalRuntime = (input) => {
    const run = tail.then(async () => {
      const before = Object.fromEntries(input.readCollections.map((name) => [name, JSON.stringify(liveStore[name] ?? [])]));
      const candidate = Object.fromEntries(input.readCollections.map((name) => [name, structuredClone(liveStore[name] ?? [])]));
      const commandId = `commit-${transactions.length + 1}`;
      transactions.push(commandId);
      // Yield inside the transaction: a competing worker must still wait its turn.
      await Promise.resolve();
      const result = await input.mutate(candidate, { commandId });
      const changed = input.allowedCollections.filter((name) => before[name] !== JSON.stringify(candidate[name] ?? []));
      for (const name of changed) liveStore[name] = structuredClone(candidate[name]);
      if (changed.length) liveStore.revision += 1;
      return { committed: true, commitId: commandId, revision: liveStore.revision, result, changedCollections: changed,
        memoryProfile: { runtimeLoadCount: 1, runtimeCloneCount: 0, fullRuntimeSerializationCount: 0 } };
    });
    tail = run.catch(() => undefined);
    return run;
  };
  const publication = createCanonicalBriefingConfidencePublicationService({
    filePath: "memory://store", liveStore, registry: ConfidencePublisherRegistry,
    now: () => new Date("2026-08-01T12:00:00.000Z"), mutateCanonicalRuntime,
    unitOfWorkFactory: () => { throw new Error("full-runtime unit of work must not be constructed"); },
  });
  const baseline = publication.captureBaseline();
  const input = createInterpretationV2Fixture();
  input.goalContract.timeline = { startDate: "2026-07-01", targetCompletionDate: "2026-12-31", currentPhase: { phaseId: "phase-one" } };
  const finalizer = createBriefingForecastFinalizer({ publicationService: publication, registry: ConfidencePublisherRegistry,
    now: () => new Date("2026-08-01T12:00:00.000Z") });
  const request = (mark) => ({
    publisherType: "weekly_briefing", userId: "user-one", occurrenceId: "weekly-one", artifactId: "weekly-one",
    cadenceOrEventType: "weekly", goalContract: input.goalContract, phaseId: "phase-one",
    strategyContext: input.strategyHypothesis, executionContext: input.executionState,
    evidenceDescriptors: input.evidenceDescriptors, previousCanonicalAssessment: prior,
    evidenceWindow: { id: "weekly-window", start: "2026-07-01T00:00:00.000Z", cutoff: "2026-07-31T23:59:59.999Z", closed: true },
    publicationCutoff: "2026-07-31T23:59:59.999Z", finalizedAt: "2026-08-01T12:00:00.000Z",
    idempotencyKey: "weekly-one", expectedPriorAssessmentId: prior.id,
    expectedRevision: baseline.revision, expectedSemanticDigest: baseline.semanticDigest,
    trajectorySegmentId: "trajectory_july", elapsedTimeAdequacy: "adequate",
    composeArtifact: () => ({ artifact: { id: "weekly-one", userId: "user-one", artifactType: "scheduled", cadence: "weekly",
      evidenceWindow: { id: "weekly-window", cadence: "weekly" }, briefing: {}, evidenceSettlement: mark } }),
  });
  return { liveStore, transactions, finalizer, request, prior };
}

describe("two workers publishing the same occurrence through the canonical publication path", () => {
  it("converge on ONE artifact, ONE authoritative watermark (the first commit's), and ONE strategic record", async () => {
    const f = setup();
    const readiness = watermark("readiness_satisfied", [], "2026-08-01T10:00:00.000Z");
    const fallback = watermark("hard_deadline_reached", ["nutrition"], "2026-08-01T11:00:00.000Z");
    const [one, two] = await Promise.all([
      f.finalizer.finalize(f.request(readiness)),
      f.finalizer.finalize(f.request(fallback)),
    ]);
    const statuses = [one.commitResult.status, two.commitResult.status];
    expect(statuses.filter((status) => status.startsWith("published_"))).toHaveLength(1);
    expect(statuses.filter((status) => status === "matched")).toHaveLength(1);
    // Exactly one committed publication, exactly one strategic record added.
    expect(f.liveStore.dailyBriefings).toHaveLength(1);
    expect(f.liveStore.goalConfidenceHistory).toHaveLength(2); // prior + ONE new assessment
    expect(f.liveStore.goalConfidenceSnapshots).toHaveLength(1);
    // The persisted watermark is the winner's, and the loser's returned artifact IS the stored one.
    const winner = one.commitResult.committed ? one : two;
    const loser = one.commitResult.committed ? two : one;
    const stored = f.liveStore.dailyBriefings[0];
    expect(stored.evidenceSettlement.integrity.digest).toBe(
      (one.commitResult.committed ? readiness : fallback).integrity.digest);
    expect(loser.commitResult.artifact.evidenceSettlement.integrity.digest).toBe(stored.evidenceSettlement.integrity.digest);
    expect(f.liveStore.goalConfidenceSnapshots[0].currentAssessmentId).toBe(winner.confidenceAssessment.id);
    expect(stored.confidencePublication.assessmentId).toBe(winner.confidenceAssessment.id);
  });

  it("is order-independent: swapping which worker is scheduled first flips the winner but never yields two artifacts or a mixed watermark", async () => {
    for (const order of [["readiness", "fallback"], ["fallback", "readiness"]]) {
      const f = setup();
      const marks = {
        readiness: watermark("readiness_satisfied", [], "2026-08-01T10:00:00.000Z"),
        fallback: watermark("hard_deadline_reached", ["nutrition"], "2026-08-01T11:00:00.000Z"),
      };
      await Promise.all(order.map((name) => f.finalizer.finalize(f.request(marks[name]))));
      expect(f.liveStore.dailyBriefings).toHaveLength(1);
      expect(f.liveStore.goalConfidenceHistory).toHaveLength(2);
      expect(f.liveStore.dailyBriefings[0].evidenceSettlement.integrity.digest).toBe(marks[order[0]].integrity.digest);
      expect(f.transactions).toHaveLength(2); // both ran, serialized; neither deadlocked or looped
    }
  });

  it("a later replay never touches the committed artifact or adds records; the stored watermark remains verifiable", async () => {
    const f = setup();
    const first = await f.finalizer.finalize(f.request(watermark("readiness_satisfied", [], "2026-08-01T10:00:00.000Z")));
    const stored = JSON.stringify(f.liveStore.dailyBriefings);
    const replay = await f.finalizer.finalize({ ...f.request(watermark("hard_deadline_reached", ["nutrition"], "2026-08-02T10:00:00.000Z")),
      expectedRevision: first.commitResult.revision, expectedSemanticDigest: undefined });
    expect(replay.commitResult).toMatchObject({ status: "matched", committed: false });
    expect(JSON.stringify(f.liveStore.dailyBriefings)).toBe(stored);
    expect(f.liveStore.goalConfidenceHistory).toHaveLength(2);
    const readback = freezeStoredEvidenceSettlement(structuredClone(f.liveStore.dailyBriefings[0]));
    expect(Object.isFrozen(readback.evidenceSettlement)).toBe(true);
  });
});
