import { describe, expect, it } from "vitest";
import { buildDexaCadencePayload, buildPhotoCadencePayload } from "./protocolCadencePresentation";
import { presentProtocolTransitionPlan } from "./protocolTransitionReviewPresentation";

const internalKeys = ["proteinBasis", "proteinRatio", "calorieStrategy", "trainingDayFlexibility", "adjustmentSize", "signals", "uncertainty"];
const internalEnums = ["body_weight", "increase_gradually", "sustainable_minimum", "reduce_slightly", "keep_current", "targeted_volume"];

function visibleText(presentation) {
  return [presentation.title, presentation.footer, ...presentation.sections.flatMap((section) => [section.label, section.primaryValue, section.supportingText])].filter(Boolean).join(" ");
}

describe("protocol transition review presentation", () => {
  it.each(["energy", "nutrition", "training", "activity", "recovery", "weight", "photos", "dexa", "briefings", "peptide", "supplement", "other"])("presents %s as grouped user-facing sections", (category) => {
    const payload = category === "photos"
      ? buildPhotoCadencePayload({ frequency: "every_two_weeks", dayOfWeek: "sunday", daypart: "morning" }, { pendingGoalDraftId: "goal_draft" })
      : category === "dexa"
        ? buildDexaCadencePayload({ frequency: "every_six_weeks" }, { pendingGoalDraftId: "goal_draft" })
        : {};
    const presentation = presentProtocolTransitionPlan(category, payload, { displayName: category === "other" ? "Additional Protocol" : undefined });
    expect(presentation.sections.length).toBeGreaterThan(0);
    expect(presentation.sections.every((section, index) => section.id && section.label && section.primaryValue && section.order === index + 1)).toBe(true);
    expect(visibleText(presentation)).not.toMatch(/\b(?:undefined|null)\b/);
  });

  it("hides fixed-protein configuration in body-weight mode", () => {
    const text = visibleText(presentProtocolTransitionPlan("nutrition", { proteinBasis: "body_weight", proteinRatio: 1, proteinTarget: 167, fixedProtein: 220 }));
    expect(text).toContain("1 g per pound of body weight");
    expect(text).toContain("About 167 g per day");
    expect(text).not.toContain("220");
  });

  it("hides body-weight configuration in fixed-grams mode", () => {
    const text = visibleText(presentProtocolTransitionPlan("nutrition", { proteinBasis: "fixed", proteinRatio: 1.1, fixedProtein: 190 }));
    expect(text).toContain("190 g per day");
    expect(text).not.toContain("per pound");
    expect(text).not.toContain("1.1");
  });

  it("never exposes stored keys or enum values in visible review text", () => {
    const fixtures = [
      ["energy", { calorieStrategy: "increase_gradually", activityStrategy: "reduce_slightly", adjustmentSize: "small", signals: [] }],
      ["nutrition", { proteinBasis: "body_weight", proteinRatio: 1, proteinTarget: 167, calorieStrategy: "increase_gradually", fatStrategy: "sustainable_minimum" }],
      ["activity", { activityStrategy: "keep_current", cardioFrequency: "as_needed", cardioDuration: "flexible" }],
      ["training", { structure: "Keep current split", priorities: ["Chest"], trainingEmphasis: "targeted_volume" }],
    ];
    for (const [category, payload] of fixtures) {
      const text = visibleText(presentProtocolTransitionPlan(category, payload));
      for (const value of [...internalKeys, ...internalEnums]) expect(text).not.toContain(value);
    }
  });
});
