import { describe, expect, it } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import { InterpretationEngine } from "./InterpretationEngine";
import {
  createStructuredInterpretation,
  validateStructuredInterpretation,
} from "./StructuredInterpretationModel";

describe("StructuredInterpretationModel", () => {
  it("rejects confidence, score, Forecast, Narrative, and publication fields", () => {
    const value = InterpretationEngine.interpret(createInterpretationV2Fixture());

    for (const forbidden of [
      "score", "goalConfidence", "forecast", "narrative",
      "publicationState", "presentationCopy", "coachingRecommendation",
    ]) {
      expect(() => createStructuredInterpretation({
        ...value,
        [forbidden]: "not_allowed",
      })).toThrow(/cannot contain/i);
    }
  });

  it("rejects non-canonical mutation and identity drift", () => {
    const value = InterpretationEngine.interpret(createInterpretationV2Fixture());
    const mutated = structuredClone(value);
    mutated.objectiveEvaluation.aggregateStatus = "ahead";

    expect(() => validateStructuredInterpretation(mutated))
      .toThrow("identity mismatch");
  });
});
