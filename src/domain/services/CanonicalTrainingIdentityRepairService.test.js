import { describe, expect, it, vi } from "vitest";
import { createCanonicalEvidenceRepository } from "../../data/repositories/CanonicalEvidenceRepository";
import { createEvidencePackageRepository } from "../../data/repositories/EvidencePackageRepository";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { repairSeatedCableRowCanonicalIdentity, SEATED_CABLE_ROW_REPAIR_PACKAGE_ID } from "./CanonicalTrainingIdentityRepairService";

function fixture() {
  const rawText = "Seater cable row\n12r 120p\n15r 120p";
  const originalPackage = { package_id: "original", userId: "founder", provenance: { source_artifacts: [{ id: "typed_evidence_0", kind: "typed_evidence", text: rawText }] } };
  const payload = { id: "training-jul12", evidence_type: "training", observed_at: "2026-07-12", metadata: { activity_type: "Traditional Strength Training", duration_seconds: 4602, active_calories: 483 }, source: { source_artifact_refs: ["typed_evidence_0"] }, provenance: { source_artifact_refs: ["typed_evidence_0"] }, exercises: [{ name: "Pull-Up", sets: [{ reps: 12, weight: 0 }] }, { name: "Seater cable row", sets: [{ reps: 12, weight: 120 }, { reps: 15, weight: 120 }] }] };
  const canonicalId = "training|2026-07-12|traditional strength training|||4602||483";
  const canonical = { canonicalId, createdAt: "2026-07-13T00:00:00Z", updatedAt: "2026-07-13T00:00:00Z", evidence_type: "training", firstObservedAt: "2026-07-12", lastObservedAt: "2026-07-12", payload, provenance: { evidence_package_ids: ["original"], source_artifact_refs: ["typed_evidence_0"], contributing_evidence_object_ids: [payload.id] }, quality: { status: "active" }, userId: "founder" };
  const objects = [canonical]; const packages = [originalPackage];
  return { canonicalId, objects, packages, rawText, repositories: { canonicalEvidence: createCanonicalEvidenceRepository(objects, { onChange: vi.fn() }), evidencePackages: createEvidencePackageRepository(packages, { onChange: vi.fn() }) } };
}

describe("immutable Seated Cable Row canonical repair", () => {
  it("supersedes the malformed wrapper while preserving the raw typo and session facts", async () => {
    const state = fixture();
    const result = await repairSeatedCableRowCanonicalIdentity({ repositories: state.repositories, userId: "founder", now: () => new Date("2026-07-13T06:00:00Z") });
    const active = state.objects.filter((object) => object.quality.status === "active");
    const stale = state.objects.find((object) => object.canonicalId === state.canonicalId);

    expect(result.correctionPackageId).toBe(SEATED_CABLE_ROW_REPAIR_PACKAGE_ID);
    expect(stale.quality).toEqual(expect.objectContaining({ status: "superseded", supersededBy: result.canonicalObject.canonicalId }));
    expect(active).toHaveLength(1);
    expect(active[0].payload.exercises.map((exercise) => exercise.name)).toEqual(["Pull-Up", "Seated Cable Row"]);
    expect(active[0].payload.exercises[1].sets).toEqual([{ reps: 12, weight: 120 }, { reps: 15, weight: 120 }]);
    expect(result.correctionPackage.provenance.source_artifacts[0].text).toContain("Seater cable row");
  });

  it("is idempotent and does not create a second session or false PR", async () => {
    const state = fixture();
    const first = await repairSeatedCableRowCanonicalIdentity({ repositories: state.repositories, userId: "founder" });
    const reportBefore = createTrainingPerformanceIntelligenceReport({ canonicalObjects: state.objects, now: "2026-07-13T12:00:00Z" });
    const second = await repairSeatedCableRowCanonicalIdentity({ repositories: state.repositories, userId: "founder" });
    const reportAfter = createTrainingPerformanceIntelligenceReport({ canonicalObjects: state.objects, now: "2026-07-13T12:00:00Z" });
    const row = reportAfter.exerciseObservations.filter((item) => item.exercise.key === "seated_cable_row");

    expect(first.applied).toBe(true);
    expect(second).toEqual(expect.objectContaining({ applied: false, idempotent: true }));
    expect(state.packages.filter((item) => item.package_id === SEATED_CABLE_ROW_REPAIR_PACKAGE_ID)).toHaveLength(1);
    expect(state.objects.filter((object) => object.quality.status === "active")).toHaveLength(1);
    expect(row).toHaveLength(1);
    expect(row[0].supporting_session_ids).toEqual(["training-jul12"]);
    expect(reportAfter.summary).toEqual(reportBefore.summary);
    expect(row[0].explanation_data.pr_detection.detected).toBe(false);
  });
});
