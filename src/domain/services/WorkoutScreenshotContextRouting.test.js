import { describe, expect, it } from "vitest";
import { classifyImageArtifacts } from "./EvidenceIntakeService";

describe("explicit Workout Logger screenshot context", () => {
  const artifacts = [
    { id: "walk-one", fileName: "Apple Health Screenshot 1.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(1_100_000) },
    { id: "walk-two", fileName: "Apple Health Screenshot 2.heic", mimeType: "image/heic" },
    { id: "strength", fileName: "back-workout.jpg", mimeType: "image/jpeg" },
  ];

  it("retains every attachment as screenshot evidence despite body-photo heuristics", () => {
    const routed = classifyImageArtifacts(artifacts, { expectedEvidenceType: "training" });
    expect(routed.progressPhotos).toEqual([]);
    expect(routed.screenshots).toEqual(artifacts);
    expect(routed.screenshots.map((item) => item.id)).toEqual(["walk-one", "walk-two", "strength"]);
  });

  it("is deterministic on retry and does not mutate or duplicate artifacts", () => {
    const first = classifyImageArtifacts(artifacts, { expectedEvidenceType: "training" });
    expect(classifyImageArtifacts(artifacts, { expectedEvidenceType: "training" })).toEqual(first);
    expect(first.screenshots).not.toBe(artifacts);
    expect(artifacts).toHaveLength(3);
  });

  it("preserves normal Progress Photos routing outside explicit workout context", () => {
    expect(classifyImageArtifacts(artifacts).progressPhotos).toEqual(artifacts);
  });
});
