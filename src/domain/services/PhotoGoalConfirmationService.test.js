import { describe, expect, it } from "vitest";
import { evaluatePhotoGoalConfirmation, selectVisibleAbsCompletionComparisons } from "./PhotoGoalConfirmationService";

const intent = {
  confirmationPurpose: "visible_abs_completion",
  goalId: "goal_visible_abs_at_rest",
  criterion: "lower_abs_visible_at_rest",
  numericalThresholdComplete: true,
};

function view({ id = "front", poseId = "front-relaxed", finding = "Lower abs are visibly present at rest with clear definition.", limitations = [], image = true, mode = "openai" } = {}) {
  return {
    id,
    poseId,
    imageHref: image ? `/${id}.jpg` : null,
    imageReference: image ? `private/${id}.jpg` : null,
    analysisMode: mode,
    structuredFindings: finding ? [{ change: finding, confidence: "high" }] : [],
    interpretationLimitations: limitations,
    provenance: { sourceIds: [`source_${id}`] },
  };
}

describe("PhotoGoalConfirmationService", () => {
  it("requires a qualified Front Relaxed view and never lets DEXA confirm by itself", () => {
    expect(evaluatePhotoGoalConfirmation({ ...intent, session: { views: [] } })).toMatchObject({ visualCriterionStatus: "uncertain", goalCompletionRecommended: false, requiredPose: "front-relaxed" });
    expect(evaluatePhotoGoalConfirmation({ ...intent, session: { views: [view({ poseId: "back-relaxed" })] } })).toMatchObject({ visualCriterionStatus: "uncertain", goalCompletionRecommended: false });
  });

  it("keeps confirmed, not confirmed, and uncertain distinct", () => {
    const confirmed = evaluatePhotoGoalConfirmation({ ...intent, session: { views: [view()] } });
    const notConfirmed = evaluatePhotoGoalConfirmation({ ...intent, session: { views: [view({ finding: "Lower abs are not yet visible at rest." })] } });
    const uncertain = evaluatePhotoGoalConfirmation({ ...intent, session: { views: [view({ finding: "The waist looks tighter." })] } });
    expect(confirmed).toMatchObject({ visualCriterionStatus: "confirmed", goalCompletionRecommended: true, transitionReady: true, requiredUserDecision: true });
    expect(notConfirmed).toMatchObject({ visualCriterionStatus: "not_confirmed", goalCompletionRecommended: false, transitionReady: false });
    expect(uncertain).toMatchObject({ visualCriterionStatus: "uncertain", goalCompletionRecommended: false, transitionReady: false });
  });

  it("preserves qualification limits and returns uncertain for unusable evidence", () => {
    const result = evaluatePhotoGoalConfirmation({ ...intent, session: { views: [view({ limitations: ["Poor framing prevents a reliable assessment."] })] } });
    expect(result.visualCriterionStatus).toBe("uncertain");
    expect(result.limitingFactors).toContain("Poor framing prevents a reliable assessment.");
  });

  it("confirms with moderate confidence from a usable primary view plus objective and journey evidence", () => {
    const front = view({ finding: "Visible abdominal contours, a lean waist, and oblique definition are present at rest.", limitations: ["Bright background differs from the prior photo.", "Post-workout pump may enhance detail."] });
    const supporting = view({ id: "rear", poseId: "back-relaxed", finding: "Rear conditioning is clear." });
    const result = evaluatePhotoGoalConfirmation({
      ...intent,
      session: { views: [front, supporting] },
      completionComparisons: { journey: { first: { id: "may" }, final: front }, recent: { previous: { id: "jul11" }, final: front } },
      latestDexa: { bodyFatPercentage: 7.7, fatMass: { value: 12.8 }, leanMass: { value: 147.5 } },
      priorDexa: { fatMass: { value: 18.4 } },
      baselineDexa: { leanMass: { value: 149.1 } },
    });
    expect(result).toMatchObject({
      visualCriterionStatus: "confirmed",
      goalCompletionRecommended: true,
      requiredUserDecision: true,
      confidence: "moderate",
      evidenceSynthesis: {
        primaryValidator: "front",
        supportingViewIds: ["rear"],
        journeyStartViewId: "may",
        recentComparatorViewId: "jul11",
      },
    });
  });

  it("does not affect a generic photo session", () => {
    expect(evaluatePhotoGoalConfirmation({ confirmationPurpose: null, session: { views: [view()] } })).toBeNull();
  });
});

describe("Visible Abs completion comparison selection", () => {
  const session = (id, captureDate, currentView, sourceMode = "canonical") => ({ id, captureDate, sourceMode, views: [currentView] });
  it("selects first-to-final separately from the recent comparison", () => {
    const first = view({ id: "first" });
    const middle = view({ id: "middle" });
    const final = view({ id: "final" });
    const sessions = [
      session("final_session", "2026-07-20", final),
      session("first_session", "2026-05-24", first),
      session("middle_session", "2026-07-11", middle),
      session("legacy", "2026-05-25", view({ id: "legacy" }), "legacy-adapted"),
      session("rear", "2026-05-26", view({ id: "rear", poseId: "back-relaxed" })),
      session("missing", "2026-05-27", view({ id: "missing", image: false })),
    ];
    const result = selectVisibleAbsCompletionComparisons({ sessions, finalSession: sessions[0], goalStartDate: "2026-05-24" });
    expect(result.journey.first.id).toBe("first");
    expect(result.journey.final.id).toBe("final");
    expect(result.recent.previous.id).toBe("middle");
    expect(result.recent.final.id).toBe("final");
  });

  it("includes a qualifying pre-goal legacy Front Relaxed view in the journey window", () => {
    const final = session("final_session", "2026-07-18", view({ id: "final" }));
    const recent = session("recent_session", "2026-07-11", view({ id: "recent" }));
    const may = session("legacy_may", "2026-05-21", view({ id: "may-front" }), "legacy-adapted");
    const result = selectVisibleAbsCompletionComparisons({ sessions: [final, recent, may], finalSession: final, goalStartDate: "2026-05-24" });
    expect(result.journey.first.id).toBe("may-front");
    expect(result.journey.first.captureDate).toBe("2026-05-21");
    expect(result.recent.previous.id).toBe("recent");
  });
});
