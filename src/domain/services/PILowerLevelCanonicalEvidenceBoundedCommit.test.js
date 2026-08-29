import { describe, expect, it } from "vitest";
import {
  createPILowerLevelCanonicalEvidenceCommitService,
  PILowerLevelSourceCommitOutcome,
} from "./PILowerLevelCanonicalEvidenceCommitService";

describe("provider-bounded lower-level canonical evidence commit", () => {
  it.each([
    ["Training", evidence("training", { metadata: { activity_type: "Strength" }, exercises: [] })],
    ["Nutrition", evidence("nutrition", { daily_totals: { calories: 2350 } })],
    ["Activity", evidence("activity_day", { daily_activity: { move_calories: 700 } })],
    ["Weight", evidence("weight", { value: 169.1, unit: "lb" })],
    ["Progress Photo", evidence("progress_photo", { angle: "front" })],
    ["DEXA", evidence("dexa", { body_fat_percent: 14.2 })],
  ])("commits and replays %s through one bounded provider mutation", async (_label, evidenceObject) => {
    const fixture = boundedFixture();
    const packageValue = evidencePackage(evidenceObject);
    const service = createPILowerLevelCanonicalEvidenceCommitService({
      mutateCanonicalRuntime: fixture.mutateCanonicalRuntime,
      enableEnergyConfidenceEnqueue: false,
      now: () => new Date("2026-08-29T12:00:00.000Z"),
    });

    const committed = await service.commitConfirmedEvidencePackage(
      packageValue,
      "user_founder_001"
    );
    const replayed = await service.commitConfirmedEvidencePackage(
      packageValue,
      "user_founder_001"
    );

    expect(committed).toMatchObject({
      committed: true,
      memoryProfile: {
        runtimeLoadCount: 1,
        runtimeCloneCount: 0,
        fullRuntimeSerializationCount: 0,
      },
    });
    expect([
      PILowerLevelSourceCommitOutcome.SOURCE_MATCHED,
      PILowerLevelSourceCommitOutcome.SOURCE_COMMITTED_WORK_MATCHED,
    ]).toContain(replayed.outcome);
    expect(fixture.calls).toBe(2);
    expect(fixture.store.evidencePackages).toHaveLength(1);
    expect(
      fixture.store.canonicalEvidenceObjects.filter((item) =>
        item.provenance?.evidence_package_ids?.includes(packageValue.package_id)
      )
    ).toHaveLength(1);
  });

  it("rolls back a staged canonical mutation without publishing partial source state", async () => {
    const fixture = boundedFixture({ failBeforePublish: true });
    const before = structuredClone(fixture.store);
    const service = createPILowerLevelCanonicalEvidenceCommitService({
      mutateCanonicalRuntime: fixture.mutateCanonicalRuntime,
      enableEnergyConfidenceEnqueue: false,
    });

    const result = await service.commitConfirmedEvidencePackage(
      evidencePackage(evidence("training", { exercises: [] })),
      "user_founder_001"
    );

    expect(result).toMatchObject({
      committed: false,
      outcome: PILowerLevelSourceCommitOutcome.PERSISTENCE_FAILURE,
    });
    expect(fixture.store).toEqual(before);
  });

  it("keeps a Founder-scale unrelated payload outside the canonical commit result graph", async () => {
    const fixture = boundedFixture();
    fixture.store.unrelatedLargeReadProjection = Array.from(
      { length: 20_000 },
      (_value, index) => ({ id: `unrelated-${index}`, text: "x".repeat(128) })
    );
    const service = createPILowerLevelCanonicalEvidenceCommitService({
      mutateCanonicalRuntime: fixture.mutateCanonicalRuntime,
      enableEnergyConfidenceEnqueue: false,
    });

    const result = await service.commitConfirmedEvidencePackage(
      evidencePackage(evidence("activity_day", {
        daily_activity: { move_calories: 700 },
      })),
      "user_founder_001"
    );

    expect(result.memoryProfile).toEqual({
      runtimeLoadCount: 1,
      runtimeCloneCount: 0,
      fullRuntimeSerializationCount: 0,
      collectionSnapshotMode: "digest",
    });
    expect(result).not.toHaveProperty("runtime");
    expect(result).not.toHaveProperty("candidate");
    expect(fixture.store.unrelatedLargeReadProjection).toHaveLength(20_000);
  });
});

function boundedFixture({ failBeforePublish = false } = {}) {
  const fixture = {
    calls: 0,
    store: {
      revision: 1,
      evidencePackages: [],
      canonicalExerciseLibrary: [],
      canonicalEvidenceObjects: [],
      piEnergyConfidenceWorkItems: [],
      piTrainingConfidenceWorkItems: [],
      briefingReconciliationWorkItems: [],
      dailyBriefings: [],
    },
  };
  fixture.mutateCanonicalRuntime = async (input) => {
    fixture.calls += 1;
    const candidate = structuredClone(fixture.store);
    const commitId = `bounded-commit-${fixture.calls}`;
    const result = await input.mutate(candidate, { commandId: commitId });
    if (failBeforePublish) throw new Error("injected transaction rollback");
    candidate.revision += 1;
    Object.keys(fixture.store).forEach((key) => delete fixture.store[key]);
    Object.assign(fixture.store, candidate);
    return {
      committed: true,
      revision: fixture.store.revision,
      commitId,
      result,
      changedCollections: ["evidencePackages", "canonicalEvidenceObjects"],
      memoryProfile: {
        runtimeLoadCount: 1,
        runtimeCloneCount: 0,
        fullRuntimeSerializationCount: 0,
        collectionSnapshotMode: "digest",
      },
    };
  };
  return fixture;
}

function evidence(evidenceType, values = {}) {
  return {
    id: `${evidenceType}_2026-08-26_fixture`,
    evidence_type: evidenceType,
    observed_at: "2026-08-26",
    provenance: { source_artifact_refs: [`${evidenceType}.png`] },
    ...values,
  };
}

function evidencePackage(evidenceObject) {
  return {
    package_id: `package_${evidenceObject.evidence_type}_2026-08-26`,
    userId: "user_founder_001",
    quality: { status: "complete" },
    review_metadata: {
      sourceReviewId: `review_${evidenceObject.evidence_type}_2026-08-26`,
      confirmedAt: "2026-08-29T12:00:00.000Z",
    },
    evidence_objects: [evidenceObject],
  };
}
