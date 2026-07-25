import fs from "node:fs";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");
const builderPage = fs.readFileSync(new URL("./edit/[category]/page.js", import.meta.url), "utf8");
const builder = fs.readFileSync(new URL("../../../../../screens/ProtocolTransitionBuilderScreen.jsx", import.meta.url), "utf8");
const screen = fs.readFileSync(new URL("../../../../../screens/ProtocolTransitionPreviewScreen.jsx", import.meta.url), "utf8");

describe("Protocol Transition preview safety", () => {
  it("exposes the dedicated preview route through the accepted handoff without production creation", () => {
    expect(page).toContain("loadProtocolTransitionPreview");
    expect(actions).not.toMatch(/saveProtocol\(|updateProtocol\(|saveGoal\(|updateGoal\(/);
  });
  it("reloads the authoritative transition draft after every mutation", () => {
    expect((actions.match(/service\.getOrPreview\(\{ handoff, historicalProtocols \}\)/g) ?? [])).toHaveLength(3);
    expect(actions).toContain("await service.saveDisposition");
    expect(actions).toContain("await service.saveProtocolDraft");
    expect(actions).toContain("await service.markReady");
  });
  it("uses one full-page reconciliation result for cards, banner, counts, final review, and Next", () => {
    expect(screen).toContain("const reconciliation = buildProtocolReviewReconciliation(draft)");
    expect(screen).toContain("<ProtocolList navigate={navigate} reconciliation={reconciliation}/>");
    expect(screen).toContain("<FinalReview reconciliation={reconciliation}/>");
    expect(screen).toContain("reconciliation.unresolvedGroupNames.join");
    expect(screen).toContain("reconciliation.isReadyForNext");
    expect(screen).not.toContain("buildProtocolReviewGroups");
    expect(screen).not.toContain("reconcileProtocolTransition(draft)");
  });
  it("passes complete transition context into the shared protocol builder shell", () => {
    for (const field of ["goalTransitionDraftId", "protocolTransitionDraftId", "pendingGoalDraftId", "sourceGoalId", "sourceProtocolId", "sourceVersionId", "selectedDisposition", "acceptedPrimaryGoal", "guardrails", "calibrationState", "supportingObjectives", "openingBaseline", "returnRoute"]) {
      expect(builderPage).toContain(field);
    }
    expect(builder).toContain("ProtocolBuilderShell");
    expect(builder).not.toContain("Review your ${review.displayName} strategy");
    expect(builder).toContain("const TOTAL_STEPS = 2");
    expect(builder).toContain("presentProtocolTransitionPlan");
    expect(builderPage).toContain('returnRoute: "/preview/goals/transition/protocols?section=protocols"');
  });
  it("uses deterministic in-flow navigation and removes error-like protocol language", () => {
    expect(screen).toContain("Back to Protocols");
    expect(screen).toContain('onClick={()=>navigate("protocols")}');
    expect(screen).not.toContain("window.history.back");
    expect(screen).not.toMatch(/Unavailable|unavailable|All protocols/);
    expect(builderPage).toContain('detailRoute: `/preview/goals/transition/protocols?section=protocols&protocol=${category}`');
    expect(builderPage).toContain('returnRoute: "/preview/goals/transition/protocols?section=protocols"');
    expect(builder).toContain("window.location.assign(transitionContext.returnRoute)");
    expect(builder).toContain("window.location.assign(transitionContext.detailRoute)");
  });
  it("presents saved drafts as prepared plans that can be reviewed or edited", () => {
    expect(screen).toContain("Updated plan prepared");
    expect(screen).toContain("Review or Edit Plan");
    expect(screen).toContain('review.reviewStatus === "reviewed"');
    expect(screen).toContain('["ready", "valid"].includes(protocolDraft.status)');
  });
  it("uses structured coaching choices instead of strategy-writing fields", () => {
    expect(builder).toContain("Grams per pound of body weight");
    expect(builder).toContain("1.0 g/lb");
    expect(builder).toContain("Current result");
    expect(builder).toContain("ChoiceGroup");
    expect(builder).not.toContain("<textarea");
    expect(builder).not.toContain("Starting intake approach");
    expect(builder).not.toContain("Known uncertainty");
    expect(builder).not.toContain("Exit criteria");
  });
});
