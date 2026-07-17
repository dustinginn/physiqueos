import { describe, expect, it } from "vitest";
import { auditUserFacingNarrative, getClaimLifecycle, inspectUserFacingLanguage, isUserFacingNarrationAllowed } from "./NarrativeEditorialPolicy";

describe("Daily Briefing user-facing editorial policy", () => {
  it.each([
    "Trend context updated.",
    "The projection remains unchanged.",
    "The current projection state is stable.",
    "No material state change was found in the evidence window.",
    "We're still moving toward the next scheduled measurement.",
    "Measurement remains pending.",
  ])("rejects internal or vague narration: %s", (text) => expect(isUserFacingNarrationAllowed(text)).toBe(false));

  it.each(["The next DEXA will tell us whether the recent loss remained mostly fat.", "Saturday's photos will show whether lower-ab definition is becoming more consistent.", "This weekend's weekly average is more useful than today's single weigh-in."])("allows named useful checkpoints: %s", (text) => expect(isUserFacingNarrationAllowed(text)).toBe(true));

  it("classifies new, relevant, background, and retired claim lifecycles", () => {
    expect(getClaimLifecycle({ claimId: "pr", evidenceDate: "2026-07-14", currentEvidenceDate: "2026-07-14" })).toBe("new");
    expect(getClaimLifecycle({ claimId: "pr", history: [], evidenceDate: "2026-07-13", currentEvidenceDate: "2026-07-14" })).toBe("relevant");
    expect(getClaimLifecycle({ claimId: "pr", history: [{ claimId: "pr" }], evidenceDate: "2026-07-13", currentEvidenceDate: "2026-07-14" })).toBe("background");
    expect(getClaimLifecycle({ claimId: "pr", history: [{ claimId: "pr" }, { claimId: "pr" }], evidenceDate: "2026-07-13", currentEvidenceDate: "2026-07-14" })).toBe("retired");
  });

  it("audits filler, generic action, checkpoint, overlap, and exhausted claims", () => {
    const audit = auditUserFacingNarrative({ hero: { title: "Still on track.", summary: "The weekly average stayed down." }, supportingObservations: ["The trend is aligned."], interpretation: ["The weekly average stayed down."], coachInsight: "Keep execution steady." }, { claimLifecycles: { pr: "retired" } });
    expect(audit.fillerHeroBullets).toHaveLength(1);
    expect(audit.genericActions).toHaveLength(1);
    expect(audit.exhaustedClaimsPresented).toEqual(["pr"]);
    expect(audit.sectionOverlap.heroInterpretation.length).toBeGreaterThan(0);
  });

  it("recognizes generic action and filler concepts after normalization", () => {
    expect(inspectUserFacingLanguage("  Continue the current plan. ")).toMatchObject({ genericAction: true });
    expect(inspectUserFacingLanguage("Strength is holding up.")).toMatchObject({ fillerSupport: true });
  });
});
