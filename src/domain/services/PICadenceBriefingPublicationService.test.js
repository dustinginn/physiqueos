import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore";
import { createPIGoalConfidenceAssessment } from "./PIGoalConfidenceAssessmentModel";
import { createPIGoalConfidenceContractFixture } from "../../fixtures/piGoalConfidenceAssessmentFixtures";
import { createPICadenceBriefingPublicationService } from "./PICadenceBriefingPublicationService";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("PI cadence briefing publication", () => {
  it("publishes the confidence successor and Midweek artifact in one commit", async () => {
    const fixture = setup();
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, baseline));
    const saved = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));

    expect(result).toMatchObject({
      status: "briefing_created_confidence_published",
      committed: true,
      revision: 8,
    });
    expect(saved.revision).toBe(8);
    expect(saved.dailyBriefings).toHaveLength(1);
    expect(saved.goalConfidenceSnapshots).toHaveLength(1);
    expect(saved.goalConfidenceHistory).toHaveLength(1);
    expect(saved.dailyBriefings[0].briefing.goalConfidence.assessmentId)
      .toBe(fixture.assessment.id);
    expect(saved.goalConfidenceSnapshots[0].currentAssessmentId)
      .toBe(fixture.assessment.id);
    expect(saved.lastCommitId).toBe(saved.goalConfidenceHistory[0].commitId);
  });

  it("matches an exact replay without advancing the revision", async () => {
    const fixture = setup();
    let baseline = fixture.service.captureBaseline();
    await fixture.service.publish(command(fixture, baseline));
    baseline = fixture.service.captureBaseline();
    const replay = command(fixture, baseline, { confidencePublicationCommand: null });
    const result = await fixture.service.publish(replay);
    expect(result).toMatchObject({ status: "matched", committed: false });
    expect(fixture.service.captureBaseline().revision).toBe(8);
  });

  it("rejects stale baselines without writing either record", async () => {
    const fixture = setup();
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, {
      ...baseline, revision: baseline.revision - 1,
    }));
    expect(result).toMatchObject({ status: "baseline_conflict", committed: false });
    const saved = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    expect(saved.revision).toBe(7);
    expect(saved.dailyBriefings).toEqual([]);
    expect(saved.goalConfidenceHistory).toEqual([]);
  });

  it("publishes Monthly with the existing cutoff-valid confidence reference", async () => {
    const fixture = setup();
    const baseline = fixture.service.captureBaseline();
    const artifact = {
      id: "monthly_briefing_user_202607",
      userId: "user",
      artifactType: "scheduled",
      cadence: "monthly",
      evidenceWindow: {
        id: "monthly:2026-07-01:2026-07-31:America/Los_Angeles",
      },
      briefing: {
        monthlyNarrative: {
          confidence: {
            assessmentId: fixture.assessment.id,
            score: fixture.assessment.score.current,
          },
        },
        monthlyPresentation: { hero: {} },
      },
    };
    const result = await fixture.service.publish({
      schemaVersion: "pi_cadence_briefing_publication_v1",
      cadence: "monthly",
      operation: "create",
      artifact,
      artifactConfidenceAssessmentId: fixture.assessment.id,
      confidencePublicationCommand: null,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
    });
    const saved = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));

    expect(result).toMatchObject({
      status: "briefing_created_confidence_matched",
      committed: true,
      revision: 8,
    });
    expect(saved.dailyBriefings).toEqual([artifact]);
    expect(saved.goalConfidenceSnapshots).toEqual([]);
    expect(saved.goalConfidenceHistory).toEqual([]);
  });
});

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cadence-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const assessment = createPIGoalConfidenceAssessment(
    createPIGoalConfidenceContractFixture()
  );
  const liveStore = createFounderRuntimeStore({
    version: "test",
    revision: 7,
    lastCommitId: "before",
    updatedAt: "2026-07-26T16:00:00.000Z",
    user: { id: "user" },
    goals: [{
      id: assessment.goalId,
      status: "active",
      type: "build_lean_mass",
      openingApproach: { value: assessment.operatingState },
      phases: [{ id: assessment.phaseId, goalId: assessment.goalId, status: "active" }],
    }],
    dailyBriefings: [],
    goalConfidenceSnapshots: [],
    goalConfidenceHistory: [],
    goalConfidenceContinuitySeeds: [],
  });
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return {
    filePath, liveStore, assessment,
    service: createPICadenceBriefingPublicationService({
      filePath, liveStore,
      now: () => new Date("2026-07-26T17:00:00.000Z"),
      unitOfWorkOptions: {
        createCommitId: () => "cadence-commit",
        createTransactionId: () => "cadence-transaction",
      },
    }),
  };
}

function command(fixture, baseline, overrides = {}) {
  const artifact = {
    id: "midweek_briefing_user_20260720_20260722",
    userId: "user",
    cadence: "midweek",
    evidenceWindow: { id: "midweek_20260720_20260722" },
    briefing: {
      goalConfidence: {
        assessmentId: fixture.assessment.id,
        score: fixture.assessment.score.current,
      },
    },
  };
  return {
    schemaVersion: "pi_cadence_briefing_publication_v1",
    cadence: "midweek",
    operation: "create",
    artifact,
    artifactConfidenceAssessmentId: fixture.assessment.id,
    confidencePublicationCommand: {
      operation: "publish_initial",
      assessment: fixture.assessment,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: null,
      publicationReason: "Cadence atomic fixture.",
      replacementAuthorized: false,
    },
    expectedRevision: baseline.revision,
    expectedSemanticDigest: baseline.semanticDigest,
    ...overrides,
  };
}
