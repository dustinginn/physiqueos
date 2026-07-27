import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore";
import { createNodeFounderStoreFileSystem } from "../../data/repositories/FounderStoreUnitOfWork";
import { createPIGoalConfidenceAssessment } from "./PIGoalConfidenceAssessmentModel";
import { createPIGoalConfidenceContractFixture } from "../../fixtures/piGoalConfidenceAssessmentFixtures";
import { createPIPhotoEventPublicationService } from "./PIPhotoEventPublicationService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("PI Photo Event publication", () => {
  it("publishes confidence and Photo Event in one commit", async () => {
    const fixture = setup();
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, baseline));
    const saved = read(fixture);
    expect(result).toMatchObject({
      status: "photo_event_created_confidence_published",
      committed: true, revision: 8, commitId: "photo-commit",
    });
    expect(saved.dailyBriefings).toHaveLength(1);
    expect(saved.goalConfidenceHistory).toHaveLength(1);
    expect(saved.goalConfidenceSnapshots[0].currentAssessmentId)
      .toBe(fixture.assessment.id);
    expect(saved.dailyBriefings[0].briefing.photoEventNarrative
      .goalConfidence.assessmentId).toBe(fixture.assessment.id);
    expect(saved.goalConfidenceHistory[0].commitId).toBe(saved.lastCommitId);
  });

  it("matches replay without changing bytes or history", async () => {
    const fixture = setup();
    let baseline = fixture.service.captureBaseline();
    await fixture.service.publish(command(fixture, baseline));
    const bytes = fs.readFileSync(fixture.filePath, "utf8");
    baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, baseline, {
      confidenceMode: "matched-only",
      confidencePublicationCommand: null,
    }));
    expect(result).toMatchObject({ status: "matched", committed: false });
    expect(fs.readFileSync(fixture.filePath, "utf8")).toBe(bytes);
    expect(read(fixture).goalConfidenceHistory).toHaveLength(1);
  });

  it("rejects same-revision semantic drift without writing", async () => {
    const fixture = setup();
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, {
      ...baseline, semanticDigest: "changed",
    }));
    expect(result.status).toBe("baseline_conflict");
    expect(read(fixture)).toMatchObject({
      revision: 7, dailyBriefings: [], goalConfidenceHistory: [],
    });
  });

  it.each(["write", "atomicReplace"])(
    "rolls back both records when %s fails", async (method) => {
      const node = createNodeFounderStoreFileSystem();
      const fixture = setup({ fileSystem: {
        ...node, [method]() { throw new Error(`forced ${method}`); },
      } });
      const bytes = fs.readFileSync(fixture.filePath);
      const result = await fixture.service.publish(command(
        fixture, fixture.service.captureBaseline()));
      expect(result).toMatchObject({ status: "persistence_failure", committed: false });
      expect(fs.readFileSync(fixture.filePath).equals(bytes)).toBe(true);
      expect(fixture.liveStore.dailyBriefings).toEqual([]);
      expect(fixture.liveStore.goalConfidenceHistory).toEqual([]);
    }
  );

  it("reports committed truth after live publication failure", async () => {
    const fixture = setup({
      publish() { throw new Error("forced publication failure"); },
    });
    const result = await fixture.service.publish(command(
      fixture, fixture.service.captureBaseline()));
    expect(result).toMatchObject({
      status: "committed_publication_failure", committed: true,
    });
    expect(read(fixture).dailyBriefings).toHaveLength(1);
    expect(read(fixture).goalConfidenceHistory).toHaveLength(1);
  });
});

function setup(unitOfWorkOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-photo-event-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime.json");
  const assessment = createPIGoalConfidenceAssessment(
    createPIGoalConfidenceContractFixture("photo_event"));
  const liveStore = createFounderRuntimeStore({
    version: "test", revision: 7, lastCommitId: "before",
    updatedAt: "2026-08-08T16:00:00.000Z", user: { id: "user" },
    goals: [{
      id: assessment.goalId, status: "active", type: "build_lean_mass",
      openingApproach: { value: assessment.operatingState },
      phases: [{ id: assessment.phaseId, goalId: assessment.goalId,
        status: "active" }],
    }],
    dailyBriefings: [], goalConfidenceSnapshots: [],
    goalConfidenceHistory: [], goalConfidenceContinuitySeeds: [],
  });
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return {
    filePath, liveStore, assessment,
    service: createPIPhotoEventPublicationService({
      filePath, liveStore,
      now: () => new Date("2026-08-08T17:00:00.000Z"),
      unitOfWorkOptions: {
        createCommitId: () => "photo-commit",
        createTransactionId: () => "photo-transaction",
        ...unitOfWorkOptions,
      },
    }),
  };
}
function command(fixture, baseline, overrides = {}) {
  const artifact = {
    id: "event_briefing_progress_photo_session_future",
    userId: "user", artifactType: "event", cadence: "event",
    trigger: { evidenceType: "photo_session", evidenceId: "session_future" },
    briefing: { photoEventNarrative: { goalConfidence: {
      assessmentId: fixture.assessment.id,
      score: fixture.assessment.score.current,
    } } },
  };
  return {
    schemaVersion: "pi_photo_event_publication_v1",
    operation: "create", confidenceMode: "publish-successor",
    artifact, photoSessionId: "session_future",
    artifactConfidenceAssessmentId: fixture.assessment.id,
    confidencePublicationCommand: {
      operation: "publish_initial", assessment: fixture.assessment,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: null,
      publicationReason: "Atomic Photo Event fixture.",
      replacementAuthorized: false,
    },
    expectedRevision: baseline.revision,
    expectedSemanticDigest: baseline.semanticDigest,
    replacementAuthorized: false,
    ...overrides,
  };
}
function read(fixture) {
  return JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
}
