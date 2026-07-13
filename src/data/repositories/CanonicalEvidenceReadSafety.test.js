import { describe, expect, it, vi } from "vitest";
import { createCanonicalEvidenceRepository } from "./CanonicalEvidenceRepository";

describe("canonical evidence query safety", () => {
  it("does not reconcile packages or invoke onChange during repeated reads", async () => {
    const canonical = [{ canonicalId: "canonical-existing", userId: "founder", evidence_type: "weight" }];
    const onChange = vi.fn();
    const repository = createCanonicalEvidenceRepository(canonical, {
      evidencePackages: [{
        id: "package-unreconciled",
        userId: "founder",
        evidence_objects: [{ id: "weight-new", evidence_type: "weight", observed_at: "2026-07-12" }],
      }],
      onChange,
    });
    const before = JSON.stringify(canonical);

    expect(await repository.listCanonicalEvidenceObjects("founder")).toEqual(canonical);
    expect(await repository.listCanonicalEvidenceObjects("founder")).toEqual(canonical);
    expect(JSON.stringify(canonical)).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });
});
