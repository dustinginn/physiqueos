import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewRepository } from "../../data/repositories/EvidenceReviewRepository";
import { createEvidenceReviewPresentation } from "./EvidenceReviewPresentationService";
import { createEvidenceReviewService } from "./EvidenceReviewService";
import { interpretScreenshotArtifactsIndividually } from "./EvidenceIntakeService";
import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";

const DATE = "2026-07-28";

describe("mixed-category screenshot intake", () => {
  it.each([
    [["nutrition-a.png", "activity-a.png"]],
    [["activity-a.png", "nutrition-a.png"]],
  ])("preserves nutrition and activity regardless of file order: %j", async (names) => {
    const interpret = createInterpreterStub();
    const result = await interpretScreenshotArtifactsIndividually({
      artifacts: names.map(artifact),
      evidenceDate: DATE,
      expectedEvidenceType: "auto",
      interpret,
      submissionId: "mixed_order",
    });

    expect(interpret).toHaveBeenCalledTimes(2);
    expect(interpret.mock.calls.map(([input]) => input.screenshots[0].fileName))
      .toEqual(names);
    expect(result.evidence_objects.map((object) => object.evidence_type).sort())
      .toEqual(["activity_day", "nutrition"]);
    expect(perFileOutcomes(result)).toHaveLength(2);
    expect(perFileOutcomes(result).every((outcome) => outcome.status === "candidates"))
      .toBe(true);
  });

  it.each([
    [["nutrition-a.png"], ["nutrition"]],
    [["activity-a.png"], ["activity_day"]],
  ])("retains single-file behavior for %j", async (names, expectedTypes) => {
    const result = await run(names);
    expect(result.evidence_objects.map((object) => object.evidence_type)).toEqual(expectedTypes);
    expect(perFileOutcomes(result)).toHaveLength(1);
  });

  it("reconciles two related nutrition screenshots into one NutritionDay", async () => {
    const result = await run(["nutrition-summary.png", "nutrition-detail.png"]);
    expect(result.evidence_objects.filter((object) => object.evidence_type === "nutrition"))
      .toHaveLength(1);
    expect(result.evidence_objects[0].provenance.source_artifact_refs.sort())
      .toEqual(["file_0", "file_1"]);
    expect(dispositions(result).every((item) => item.disposition === "retained_or_merged"))
      .toBe(true);
  });

  it("reconciles two related activity screenshots into one ActivityDay", async () => {
    const result = await run(["activity-summary.png", "activity-detail.png"]);
    expect(result.evidence_objects.filter((object) => object.evidence_type === "activity_day"))
      .toHaveLength(1);
    expect(result.evidence_objects[0].provenance.source_artifact_refs.sort())
      .toEqual(["file_0", "file_1"]);
  });

  it("preserves recognized siblings and explicitly records unrecognized files", async () => {
    const result = await run(["nutrition-a.png", "unrecognized.png"]);
    expect(result.evidence_objects.map((object) => object.evidence_type)).toEqual(["nutrition"]);
    expect(perFileOutcomes(result)).toEqual([
      expect.objectContaining({ fileId: "file_0", status: "candidates" }),
      expect.objectContaining({
        candidateCount: 0,
        fileId: "file_1",
        reason: "No canonical evidence candidate was recognized.",
        status: "unrecognized",
      }),
    ]);
  });

  it("preserves valid siblings when one per-file interpretation fails", async () => {
    const result = await run(["activity-a.png", "failure.png"]);
    expect(result.evidence_objects.map((object) => object.evidence_type)).toEqual(["activity_day"]);
    expect(perFileOutcomes(result)[1]).toEqual(
      expect.objectContaining({
        candidateCount: 0,
        fileId: "file_1",
        reason: "fixture interpretation failure",
        status: "interpretation_failure",
      })
    );
  });

  it("keeps four observable outcomes and every valid category across three-plus files", async () => {
    const result = await run([
      "nutrition-summary.png",
      "activity-summary.png",
      "nutrition-detail.png",
      "unrecognized.png",
    ]);
    expect(perFileOutcomes(result)).toHaveLength(4);
    expect(result.evidence_objects.map((object) => object.evidence_type).sort())
      .toEqual(["activity_day", "nutrition"]);
    expect(dispositions(result)).toHaveLength(4);
    expect(dispositions(result).some((item) => item.disposition === "unrecognized")).toBe(true);
  });

  it("stages one mixed review without canonical writes", async () => {
    const result = await run(["nutrition-a.png", "activity-a.png"]);
    const reviews = [];
    const repository = createEvidenceReviewRepository(reviews);
    const service = createEvidenceReviewService({
      now: () => new Date("2026-07-28T12:00:00.000Z"),
      repositories: { evidenceReviews: repository },
    });
    const review = await service.stage({
      evidencePackage: result,
      userId: "diagnostic-user",
    });
    const presentation = createEvidenceReviewPresentation({
      evidencePackage: review.interpretedEvidence,
    });

    expect(review.evidenceTypes.sort()).toEqual(["activity_day", "nutrition"]);
    expect(presentation.items.map((item) => item.type).sort()).toEqual(["activity", "nutrition"]);
    expect(presentation.summary.included).toBe(2);
    expect(review.interpretedEvidence.evidence_objects).toHaveLength(2);
    expect(review.interpretedEvidence.evidence_objects.map((item) => item.evidence_type).sort())
      .toEqual(["activity_day", "nutrition"]);
    const reviewDiagnostic = review.interpretedEvidence.diagnostics.stages.at(-1);
    expect(reviewDiagnostic).toEqual(
      expect.objectContaining({
        preparedSaveCommandCount: 2,
        reviewCandidateCount: 2,
      })
    );
    expect([...reviewDiagnostic.reviewCategoryList].sort())
      .toEqual(["activity_day", "nutrition"]);
    expect(reviews).toHaveLength(1);
  });

  it("prepares canonical changes for both mixed categories without repository writes", async () => {
    const result = await run(["nutrition-a.png", "activity-a.png"]);
    const prepared = reconcileConfirmedEvidencePackage({
      evidencePackage: result,
      existingCanonicalObjects: [],
      userId: "fixture-user",
    });

    expect(prepared.changedObjects.map((item) => item.evidence_type).sort())
      .toEqual(["activity_day", "nutrition"]);
    expect(prepared.scope.incomingCanonicalIdentities).toHaveLength(2);
    expect(prepared.report.addedCanonicalIds).toHaveLength(2);
  });
});

async function run(names) {
  return interpretScreenshotArtifactsIndividually({
    artifacts: names.map(artifact),
    evidenceDate: DATE,
    expectedEvidenceType: "auto",
    interpret: createInterpreterStub(),
    submissionId: "mixed_fixture",
  });
}

function artifact(fileName, index) {
  return {
    dataUrl: "data:image/png;base64,fixture",
    fileName,
    id: `file_${index}`,
    mimeType: "image/png",
    uploadedAt: "2026-07-28T10:00:00.000Z",
  };
}

function createInterpreterStub() {
  return vi.fn(async ({ screenshots, submissionId }) => {
    const screenshot = screenshots[0];
    if (screenshot.fileName.includes("failure")) {
      throw new Error("fixture interpretation failure");
    }
    const type = screenshot.fileName.includes("nutrition")
      ? "nutrition"
      : screenshot.fileName.includes("activity")
        ? "activity_day"
        : null;
    const objects = type ? [evidenceObject(type, submissionId)] : [];
    return {
      fallbackReason: null,
      provider: "openai",
      warning: null,
      evidencePackage: {
        package_id: submissionId,
        captured_at: "2026-07-28T10:00:00.000Z",
        detected_evidence_objects: type
          ? [{ evidence_type: type, canonical_name: type, count: 1 }]
          : [],
        detected_evidence_type: type ?? "unknown",
        detected_evidence_type_confidence: type ? "high" : "low",
        evidence_objects: objects,
        interpreter: { name: "fixture", provider: "openai" },
        provenance: {
          submission_id: submissionId,
          source_artifacts: [{ id: screenshot.id, file_name: screenshot.fileName }],
        },
        quality: {
          extraction_confidence: type ? "high" : "low",
          interpreter_confidence: type ? "high" : "low",
          limitations: [],
          status: type ? "complete" : "limited",
        },
      },
    };
  });
}

function evidenceObject(type, id) {
  const common = {
    confidence: { extraction: "high", interpretation: "high" },
    evidence_type: type,
    id,
    observed_at: DATE,
    provenance: { source_artifact_refs: ["screenshot_0"] },
    quality: { limitations: [], status: "complete" },
    source: {
      application: type === "nutrition" ? "MyFitnessPal" : "Apple Fitness",
      modality: "screenshot",
      source_artifact_refs: ["screenshot_0"],
    },
  };
  if (type === "nutrition") {
    return {
      ...common,
      daily_totals: { calories: 2000 },
      meals: [],
      metadata: { date: DATE, source: "MyFitnessPal" },
      nutrients: [],
      targets: {},
      values: [],
    };
  }
  return {
    ...common,
    daily_activity: { exercise_minutes: 30, move_calories: 500 },
    derived_metrics: {},
    metadata: { date: DATE, source: "Apple Fitness" },
    references: { training_session_ids: [] },
    values: [],
  };
}

function perFileOutcomes(result) {
  return result.diagnostics.stages.find(
    (stage) => stage.label === "Per-file screenshot interpretation"
  ).perFileOutcomes;
}

function dispositions(result) {
  return result.diagnostics.stages.find(
    (stage) => stage.label === "Per-file screenshot reconciliation"
  ).dispositions;
}
