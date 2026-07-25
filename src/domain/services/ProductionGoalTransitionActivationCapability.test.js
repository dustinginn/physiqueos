import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  issueProductionGoalTransitionActivationCapability,
  verifyProductionGoalTransitionActivationCapability,
} from "./ProductionGoalTransitionActivationCapability";

describe("ProductionGoalTransitionActivationCapability", () => {
  const transitionIdentity = {
    goalTransitionDraftId: "transition_1",
    targetGoalDraftId: "goal_2",
  };
  const storePath = path.resolve("temporary-production-shaped-store.json");

  it("accepts only the exact issued object and exact bindings", () => {
    const capability = issueProductionGoalTransitionActivationCapability({
      canonicalProductionStorePath: storePath,
      transitionIdentity,
      finalReviewTokenIdentity: "token_1",
      founderConfirmed: true,
    });
    expect(verifyProductionGoalTransitionActivationCapability(capability, {
      storePath,
      transitionIdentity,
      finalReviewTokenIdentity: "token_1",
    })).toBe(true);
    expect(verifyProductionGoalTransitionActivationCapability(
      { ...capability },
      { storePath, transitionIdentity, finalReviewTokenIdentity: "token_1" }
    )).toBe(false);
    expect(verifyProductionGoalTransitionActivationCapability(capability, {
      storePath: path.resolve("another-store.json"),
      transitionIdentity,
      finalReviewTokenIdentity: "token_1",
    })).toBe(false);
    expect(verifyProductionGoalTransitionActivationCapability(capability, {
      storePath,
      transitionIdentity,
      finalReviewTokenIdentity: "token_2",
    })).toBe(false);
  });

  it("refuses issuance without explicit founder confirmation", () => {
    expect(() => issueProductionGoalTransitionActivationCapability({
      canonicalProductionStorePath: storePath,
      transitionIdentity,
      finalReviewTokenIdentity: "token_1",
      founderConfirmed: false,
    })).toThrow("requirements are incomplete");
  });
});
