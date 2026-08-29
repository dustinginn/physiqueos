import { describe, expect, it } from "vitest";
import {
  createShallowWritableFounderRuntime,
  detachBoundedFounderCollections,
} from "./BoundedFounderRuntimeMutation.js";

describe("bounded Founder runtime mutation shell", () => {
  it("keeps the loaded snapshot frozen while allowing bounded collection replacement", () => {
    const evidence = [{ canonicalId: "canonical-existing" }];
    const goals = [{ id: "goal-existing" }];
    const loaded = Object.freeze({
      revision: 29,
      canonicalEvidenceObjects: evidence,
      goals,
    });

    const candidate = createShallowWritableFounderRuntime(loaded);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(candidate)).toBe(false);
    expect(candidate.canonicalEvidenceObjects).toBe(evidence);
    expect(candidate.goals).toBe(goals);

    expect(detachBoundedFounderCollections(candidate, [
      "canonicalEvidenceObjects",
    ])).toBe(1);
    expect(candidate.canonicalEvidenceObjects).not.toBe(evidence);
    expect(candidate.canonicalEvidenceObjects[0]).toBe(evidence[0]);
    expect(candidate.goals).toBe(goals);

    candidate.canonicalEvidenceObjects = [
      ...candidate.canonicalEvidenceObjects,
      { canonicalId: "canonical-new" },
    ];
    expect(loaded.canonicalEvidenceObjects).toBe(evidence);
    expect(loaded.canonicalEvidenceObjects).toHaveLength(1);
    expect(candidate.canonicalEvidenceObjects).toHaveLength(2);
  });
});
