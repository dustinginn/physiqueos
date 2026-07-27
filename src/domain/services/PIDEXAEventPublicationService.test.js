import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore";
import { createNodeFounderStoreFileSystem } from "../../data/repositories/FounderStoreUnitOfWork";
import { createPIGoalConfidenceAssessment } from "./PIGoalConfidenceAssessmentModel";
import { createPIGoalConfidenceContractFixture } from "../../fixtures/piGoalConfidenceAssessmentFixtures";
import { createPIDEXAEventPublicationService } from "./PIDEXAEventPublicationService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("PI DEXA Event publication", () => {
  it("publishes confidence and Event in one Founder commit", async () => {
    const fixture = setup();
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, baseline));
    const saved = read(fixture);
    expect(result).toMatchObject({
      status: "dexa_event_created_confidence_published",
      committed: true,
      revision: 8,
      commitId: "dexa-commit",
    });
    expect(saved.revision).toBe(8);
    expect(saved.dailyBriefings).toHaveLength(1);
    expect(saved.goalConfidenceHistory).toHaveLength(1);
    expect(saved.goalConfidenceSnapshots[0].currentAssessmentId)
      .toBe(fixture.assessment.id);
    expect(saved.dailyBriefings[0].briefing.dexaEventNarrative
      .goalConfidence.assessmentId).toBe(fixture.assessment.id);
    expect(saved.goalConfidenceHistory[0].commitId).toBe(saved.lastCommitId);
  });

  it("matches exact replay without changing bytes or history", async () => {
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

  it("rejects changed semantic digest without either write", async () => {
    const fixture = setup();
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, {
      ...baseline, semanticDigest: "changed",
    }));
    expect(result).toMatchObject({ status: "baseline_conflict", committed: false });
    expect(read(fixture)).toMatchObject({
      revision: 7,
      dailyBriefings: [],
      goalConfidenceHistory: [],
    });
  });

  it("requires explicit authorization and matched-only confidence for regeneration", async () => {
    const fixture = setup();
    const baseline = fixture.service.captureBaseline();
    const invalid = await fixture.service.publish(command(fixture, baseline, {
      operation: "regenerate",
      confidenceMode: "matched-only",
      confidencePublicationCommand: null,
    }));
    expect(invalid.status).toBe("semantic_conflict");
    expect(read(fixture).revision).toBe(7);
  });

  it.each(["write", "atomicReplace"])(
    "rolls back confidence and Event when %s fails", async (method) => {
      const node = createNodeFounderStoreFileSystem();
      const fixture = setup({ fileSystem: {
        ...node,
        [method]() { throw new Error(`forced ${method}`); },
      } });
      const before = fs.readFileSync(fixture.filePath);
      const baseline = fixture.service.captureBaseline();
      const result = await fixture.service.publish(command(fixture, baseline));
      expect(result).toMatchObject({ status: "persistence_failure", committed: false });
      expect(fs.readFileSync(fixture.filePath).equals(before)).toBe(true);
      expect(fixture.liveStore.goalConfidenceHistory).toEqual([]);
      expect(fixture.liveStore.dailyBriefings).toEqual([]);
    }
  );

  it("reports durable truth when live publication fails", async () => {
    const fixture = setup({
      publish() { throw new Error("forced live publication failure"); },
    });
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, baseline));
    expect(result).toMatchObject({
      status: "committed_publication_failure", committed: true,
    });
    expect(read(fixture).goalConfidenceHistory).toHaveLength(1);
    expect(read(fixture).dailyBriefings).toHaveLength(1);
    expect(fixture.liveStore.goalConfidenceHistory).toEqual([]);
  });
});

function setup(unitOfWorkOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dexa-event-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const assessment = createPIGoalConfidenceAssessment(
    createPIGoalConfidenceContractFixture("authoritative_dexa_support")
  );
  const liveStore = createFounderRuntimeStore({
    version: "test",
    revision: 7,
    lastCommitId: "before",
    updatedAt: "2026-08-15T16:00:00.000Z",
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
    service: createPIDEXAEventPublicationService({
      filePath, liveStore,
      now: () => new Date("2026-08-15T17:00:00.000Z"),
      unitOfWorkOptions: {
        createCommitId: () => "dexa-commit",
        createTransactionId: () => "dexa-transaction",
        ...unitOfWorkOptions,
      },
    }),
  };
}
function command(fixture, baseline, overrides = {}) {
  const artifact = {
    id: "dexa_event_dexa_august_15",
    userId: "user",
    artifactType: "event",
    cadence: "event",
    trigger: { evidenceType: "dexa", evidenceId: "dexa_august_15" },
    briefing: { dexaEventNarrative: { goalConfidence: {
      assessmentId: fixture.assessment.id,
      score: fixture.assessment.score.current,
    } } },
  };
  return {
    schemaVersion: "pi_dexa_event_publication_v1",
    operation: "create",
    confidenceMode: "publish-successor",
    artifact,
    canonicalDEXAId: "dexa_august_15",
    artifactConfidenceAssessmentId: fixture.assessment.id,
    confidencePublicationCommand: {
      operation: "publish_initial",
      assessment: fixture.assessment,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: null,
      publicationReason: "Atomic DEXA Event fixture.",
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
