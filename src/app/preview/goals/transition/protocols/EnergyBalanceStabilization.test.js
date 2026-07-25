import fs from "node:fs";
import { describe, expect, it } from "vitest";

const editPage = fs.readFileSync(new URL("./edit/[category]/page.js", import.meta.url), "utf8");
const builder = fs.readFileSync(new URL("../../../../../screens/ProtocolTransitionBuilderScreen.jsx", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("../../../../../screens/ProtocolTransitionPreviewScreen.jsx", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");

describe("Energy Balance transition stabilization", () => {
  it("routes Energy Balance directly from protocol detail to its decision step", () => {
    expect(preview).toContain('`/preview/goals/transition/protocols/edit/${review.category}`');
    expect(editPage).toContain("const requestedStep = Number(query.step) || 1");
    expect(builder).toContain("const TOTAL_STEPS = 2");
  });

  it("does not offer or save unresolved custom Energy Balance choices", () => {
    expect(builder).not.toContain("Custom starting range");
    expect(builder).not.toContain("Custom weekly approach");
    expect(builder).toContain('["increase_gradually", "estimated_maintenance"].includes(payload.calorieStrategy)');
    expect(builder).toContain('["keep_current", "reduce_slightly"].includes(payload.activityStrategy)');
    expect(builder).toContain("if (!canSaveProtocol(review.category, payload))");
  });

  it("renders a plain-language Energy Balance review and specific save action", () => {
    expect(builder).toContain("presentProtocolTransitionPlan");
    expect(builder).toContain("Save ${review.displayName} Plan");
  });

  it("keeps saving isolated to the preview transition service", () => {
    expect(actions).toContain("saveProtocolDraft");
    expect(actions).not.toMatch(/saveProtocol\(|updateProtocol\(|saveGoal\(|updateGoal\(/);
  });
});
