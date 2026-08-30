import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from "../confidence/BriefingForecastFinalizer";
import { ConfidencePublisherRegistry } from
  "../confidence/ConfidencePublisherRegistry";
import { createCanonicalBriefingConfidencePublicationService } from
  "./CanonicalBriefingConfidencePublicationService";

const directories = [];
afterEach(() => {
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true }));
});

describe("canonical briefing and Confidence V2 atomic publication", () => {
  it("commits the artifact, immutable history, and current pointer together", async () => {
    const fixture = setup();
    const result = await fixture.finalizer.finalize(fixture.request());
    expect(result.commitResult).toMatchObject({
      status: "published_reaffirmation", committed: true,
    });
    const persisted = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    expect(persisted.dailyBriefings).toHaveLength(1);
    expect(persisted.goalConfidenceHistory).toHaveLength(2);
    expect(persisted.goalConfidenceSnapshots[0].currentAssessmentId)
      .toBe(result.confidenceAssessment.id);
    expect(persisted.dailyBriefings[0].confidencePublication.assessmentId)
      .toBe(result.confidenceAssessment.id);
    expect(persisted.goalConfidenceHistory.at(-1).commitId)
      .toBe(persisted.lastCommitId);
  });

  it("is idempotent for the same occurrence and fingerprint", async () => {
    const fixture = setup();
    const first = await fixture.finalizer.finalize(fixture.request());
    const replay = await fixture.finalizer.finalize(fixture.request({
      expectedRevision: first.commitResult.revision,
      expectedSemanticDigest: undefined,
    }));
    expect(replay.commitResult).toMatchObject({ status: "matched", committed: false });
    const persisted = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    expect(persisted.dailyBriefings).toHaveLength(1);
    expect(persisted.goalConfidenceHistory).toHaveLength(2);
  });

  it("atomically completes an owned scheduled claim without treating it as replacement", async () => {
    const fixture = setup();
    const store = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    store.dailyBriefings.push({ id: "weekly-one", userId: "user-one",
      artifactType: "scheduled", cadence: "weekly", briefing: null,
      evidenceWindow: { id: "weekly-window", cadence: "weekly" },
      lifecycle: { generationStatus: "in_progress" } });
    fs.writeFileSync(fixture.filePath, `${JSON.stringify(store)}\n`);
    const result = await fixture.finalizer.finalize(fixture.request({
      expectedSemanticDigest: undefined,
    }));
    expect(result.commitResult).toMatchObject({ committed: true });
    const persisted = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    expect(persisted.dailyBriefings).toHaveLength(1);
    expect(persisted.dailyBriefings[0].briefing).toEqual({});
    expect(persisted.dailyBriefings[0].replacedBriefingHistory).toBeUndefined();
  });

  it("replaces an occurrence only with exact artifact and assessment lineage", async () => {
    const fixture = setup();
    const first = await fixture.finalizer.finalize(fixture.request());
    const baseline = fixture.publication.captureBaseline();
    const replacement = await fixture.finalizer.finalize(fixture.request({
      occurrenceId: "weekly-one-correction",
      artifactId: "weekly-one-corrected",
      idempotencyKey: "weekly-one-corrected",
      previousCanonicalAssessment: first.confidenceAssessment,
      expectedPriorAssessmentId: first.confidenceAssessment.id,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      replacementAuthorized: true,
      replacesArtifactId: "weekly-one",
      replacesAssessmentId: first.confidenceAssessment.id,
      composeArtifact: () => ({ artifact: {
        id: "weekly-one-corrected", userId: "user-one",
        artifactType: "scheduled", cadence: "weekly",
        evidenceWindow: { id: "weekly-window", cadence: "weekly" }, briefing: {},
      } }),
    }));
    expect(replacement.commitResult).toMatchObject({
      status: expect.stringMatching(/^published_/), committed: true,
    });
    const persisted = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    expect(persisted.dailyBriefings).toHaveLength(1);
    expect(persisted.dailyBriefings[0].id).toBe("weekly-one-corrected");
    expect(persisted.dailyBriefings[0].replacedBriefingHistory[0].artifact.id)
      .toBe("weekly-one");
    expect(persisted.goalConfidenceHistory).toHaveLength(3);
    expect(persisted.goalConfidenceSnapshots[0].currentAssessmentId)
      .toBe(replacement.confidenceAssessment.id);
  });

  it("publishes an auditable same-score successor at the stable root", async () => {
    const fixture = setup();
    const first = await fixture.finalizer.finalize(fixture.request());
    const baseline = fixture.publication.captureBaseline();
    const replacement = await fixture.finalizer.finalize(fixture.request({
      idempotencyKey: "weekly-one|revision|dependency-b",
      previousCanonicalAssessment: first.confidenceAssessment,
      expectedPriorAssessmentId: first.confidenceAssessment.id,
      expectedPriorArtifactId: "weekly-one",
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      replacementAuthorized: true,
      replacesArtifactId: "weekly-one",
      replacesAssessmentId: first.confidenceAssessment.id,
      sourceLineage: { reason: "late_evidence_reconciliation" },
    }));

    expect(replacement.commitResult).toMatchObject({
      status: "published_reaffirmation",
      committed: true,
    });
    expect(replacement.numericConfidenceProjection.currentPercentage)
      .toBe(first.numericConfidenceProjection.currentPercentage);
    expect(replacement.numericConfidenceProjection.movement)
      .toBe("no_meaningful_change");
    const persisted = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    expect(persisted.dailyBriefings).toHaveLength(1);
    expect(persisted.dailyBriefings[0].id).toBe("weekly-one");
    expect(persisted.dailyBriefings[0].replacedBriefingHistory[0]).toMatchObject({
      reason: "late_evidence_reconciliation",
      artifact: { id: "weekly-one" },
    });
    expect(persisted.goalConfidenceHistory).toHaveLength(3);
  });

  it("fails closed on predecessor conflict without a partial artifact", async () => {
    const fixture = setup();
    const result = await fixture.finalizer.finalize(fixture.request({
      expectedPriorAssessmentId: "wrong-prior",
    }));
    expect(result.commitResult).toMatchObject({
      status: "expected_prior_conflict", committed: false,
    });
    const persisted = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    expect(persisted.dailyBriefings).toEqual([]);
    expect(persisted.goalConfidenceHistory).toHaveLength(1);
  });

  it("rejects a forged publisher capability before persistence", async () => {
    const fixture = setup();
    const result = await fixture.publication.publish({ authorization: {
      registryVersion: ConfidencePublisherRegistry.version,
      publisherType: "weekly_briefing",
    } });
    expect(result).toMatchObject({
      status: "publisher_authorization_invalid", committed: false,
    });
    expect(JSON.parse(fs.readFileSync(fixture.filePath, "utf8")).revision).toBe(7);
  });

  it("publishes through one bounded provider mutation without full-runtime unit of work", async () => {
    const fixture = setup({ bounded: true });
    const result = await fixture.finalizer.finalize(fixture.request());

    expect(result.commitResult).toMatchObject({
      status: "published_reaffirmation",
      committed: true,
      memoryProfile: {
        runtimeLoadCount: 1,
        runtimeCloneCount: 0,
        fullRuntimeSerializationCount: 0,
        runtimeCollectionLoadCount: 4,
      },
    });
    expect(fixture.unitOfWorkFactory).not.toHaveBeenCalled();
    expect(fixture.boundedCalls).toHaveLength(1);
    expect(fixture.boundedCalls[0]).toMatchObject({
      operation: "briefing-confidence-publication",
      allowedCollections: [
        "dailyBriefings",
        "goalConfidenceSnapshots",
        "goalConfidenceHistory",
        "confidenceInitializationArtifacts",
      ],
      readCollections: [
        "dailyBriefings",
        "goalConfidenceSnapshots",
        "goalConfidenceHistory",
        "confidenceInitializationArtifacts",
      ],
      readApplicationContext: false,
      readImportMetadata: false,
    });
    expect(fixture.liveStore.dailyBriefings).toHaveLength(1);
    expect(fixture.liveStore.goalConfidenceHistory).toHaveLength(2);
  });

  it("recognizes an exact bounded provider replay without duplicating publication", async () => {
    const fixture = setup({ bounded: true });
    const first = await fixture.finalizer.finalize(fixture.request());
    const replay = await fixture.finalizer.finalize(fixture.request({
      expectedRevision: first.commitResult.revision,
      expectedSemanticDigest: undefined,
    }));

    expect(replay.commitResult).toMatchObject({
      status: "matched",
      committed: false,
    });
    expect(fixture.liveStore.dailyBriefings).toHaveLength(1);
    expect(fixture.liveStore.goalConfidenceHistory).toHaveLength(2);
    expect(fixture.boundedCalls).toHaveLength(2);
  });
});

function setup({ bounded = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "confidence-v2-"));
  directories.push(directory);
  const filePath = path.join(directory, "store.json");
  const prior = previous();
  const store = {
    revision: 7,
    updatedAt: "2026-07-01T00:00:00.000Z",
    lastCommitId: "prior-commit",
    dailyBriefings: [],
    confidenceInitializationArtifacts: [],
    goalConfidenceHistory: [{
      id: "prior-history", assessmentId: prior.id, goalId: prior.goalId,
      phaseId: prior.phaseId, persistedAt: prior.provenance.generatedAt,
      assessment: prior,
    }],
    goalConfidenceSnapshots: [{
      id: "prior-snapshot", goalId: prior.goalId, phaseId: prior.phaseId,
      currentAssessmentId: prior.id, currentScore: prior.score.current,
      scoreBand: prior.score.band, historyRecordId: "prior-history",
    }],
    goalConfidenceContinuitySeeds: [],
    replacedBriefingHistory: [],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
  const liveStore = structuredClone(store);
  const boundedCalls = [];
  const unitOfWorkFactory = vi.fn(() => {
    throw new Error("Full-runtime unit of work must not be constructed.");
  });
  const mutateCanonicalRuntime = bounded
    ? async (input) => {
      boundedCalls.push(input);
      const before = Object.fromEntries(input.readCollections.map((name) => [
        name,
        JSON.stringify(liveStore[name] ?? []),
      ]));
      const candidate = Object.fromEntries(input.readCollections.map((name) => [
        name,
        structuredClone(liveStore[name] ?? []),
      ]));
      const commandId = `bounded-commit-${boundedCalls.length}`;
      const result = await input.mutate(candidate, { commandId });
      const changedCollections = input.allowedCollections.filter((name) =>
        before[name] !== JSON.stringify(candidate[name] ?? []));
      for (const name of changedCollections) {
        liveStore[name] = structuredClone(candidate[name]);
      }
      if (changedCollections.length) liveStore.revision += 1;
      return {
        committed: true,
        commitId: commandId,
        revision: liveStore.revision,
        result,
        changedCollections,
        memoryProfile: {
          runtimeLoadCount: 1,
          runtimeCloneCount: 0,
          fullRuntimeSerializationCount: 0,
          boundedCollectionCloneCount: input.allowedCollections.length,
          runtimeCollectionLoadCount: input.readCollections.length,
        },
      };
    }
    : null;
  const publication = createCanonicalBriefingConfidencePublicationService({
    filePath, liveStore, registry: ConfidencePublisherRegistry,
    now: () => new Date("2026-08-01T12:00:00.000Z"),
    ...(bounded ? { mutateCanonicalRuntime, unitOfWorkFactory } : {}),
  });
  const baseline = publication.captureBaseline();
  const input = createInterpretationV2Fixture();
  input.goalContract.timeline = {
    startDate: "2026-07-01", targetCompletionDate: "2026-12-31",
    currentPhase: { phaseId: "phase-one" },
  };
  const finalizer = createBriefingForecastFinalizer({
    publicationService: publication,
    registry: ConfidencePublisherRegistry,
    now: () => new Date("2026-08-01T12:00:00.000Z"),
  });
  return {
    filePath, publication, finalizer, liveStore, boundedCalls,
    unitOfWorkFactory,
    request: (overrides = {}) => ({
      publisherType: "weekly_briefing", userId: "user-one",
      occurrenceId: "weekly-one", artifactId: "weekly-one",
      cadenceOrEventType: "weekly", goalContract: input.goalContract,
      phaseId: "phase-one", strategyContext: input.strategyHypothesis,
      executionContext: input.executionState,
      evidenceDescriptors: input.evidenceDescriptors,
      previousCanonicalAssessment: prior,
      evidenceWindow: { id: "weekly-window", start: "2026-07-01T00:00:00.000Z",
        cutoff: "2026-07-31T23:59:59.999Z", closed: true },
      publicationCutoff: "2026-07-31T23:59:59.999Z",
      finalizedAt: "2026-08-01T12:00:00.000Z",
      idempotencyKey: "weekly-one", expectedPriorAssessmentId: prior.id,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      trajectorySegmentId: "trajectory_july", elapsedTimeAdequacy: "adequate",
      composeArtifact: () => ({ artifact: { id: "weekly-one", userId: "user-one",
        artifactType: "scheduled", cadence: "weekly",
        evidenceWindow: { id: "weekly-window", cadence: "weekly" }, briefing: {} } }),
      ...overrides,
    }),
  };
}

function previous() {
  return {
    schemaVersion: "pi_goal_confidence_assessment_v1",
    id: "prior-assessment", goalId: "goal_build_muscle", phaseId: "phase-one",
    operatingState: "calibration", evidenceCutoff: "2026-06-30T23:59:59.999Z",
    score: { current: 55, prior: 50, band: "developing",
      movement: { direction: "held", magnitude: "none" } },
    contributors: [], unresolvedUncertainty: [], primaryReason: "Prior V1 context.",
    provenance: { generatedAt: "2026-07-01T00:00:00.000Z" },
  };
}
