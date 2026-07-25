import fs from "node:fs";
import { describe, expect, it } from "vitest";

const actions = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");
const builder = fs.readFileSync(
  new URL("../../../../screens/ProtocolTransitionBuilderScreen.jsx", import.meta.url),
  "utf8"
);

describe("live Protocol Transition save boundary", () => {
  it("returns safe founder copy while retaining structured diagnostic metadata", () => {
    expect(actions).toContain("error?.code ?? \"PROTOCOL_TRANSITION_SAVE_FAILED\"");
    expect(actions).toContain("We couldn't save this plan. Your current goal is unchanged. Please try again.");
    expect(actions).not.toContain("Cannot read properties of undefined");
  });

  it("does not navigate after failure and prevents duplicate pending submissions", () => {
    expect(builder).toContain("window.location.assign(transitionContext.returnRoute)");
    expect(builder.indexOf("window.location.assign(transitionContext.returnRoute)"))
      .toBeLessThan(builder.indexOf("} catch (submissionError)"));
    expect(builder).toContain("setIsSubmitting(true)");
    expect(builder).toContain("isSubmitting={isSubmitting}");
  });

  it("contains no production activation dependency", () => {
    expect(actions).not.toMatch(
      /ProductionGoalTransitionActivationService|GoalTransitionActivationCoordinator|FounderStoreUnitOfWork|ActivationStagedRepositoryFactory/
    );
  });
});
