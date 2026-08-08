import { describe, expect, it } from "vitest";
import { monthlyPreviewFixtures } from "../../fixtures/monthlyBriefingPreview";
import { composeMonthlyBriefingPreview } from "./MonthlyBriefingPreviewService";
import {
  auditMonthlyNarrativeModel,
} from "./MonthlyNarrativeCompositionService";

const FIXED_GENERATED_AT = "2026-07-30T20:00:00.000Z";

function compose(name) {
  return composeMonthlyBriefingPreview({
    ...monthlyPreviewFixtures[name],
    generatedAt: FIXED_GENERATED_AT,
  });
}

describe("canonical Monthly coaching narrative", () => {
  it("exercises PI editorial translation in the real Monthly composition boundary", () => {
    const narrative = compose("julyContinuation");
    expect(narrative.monthlyNarrative.translationVersion).toBe("pi_editorial_translation_v1");
    expect(narrative.monthlyNarrative.editorialAudit).toMatchObject({
      passes: true,
      issues: [],
    });
    expect(narrative.monthlyNarrative.editorialAudit.inspectedNarration.length).toBeGreaterThan(30);
  });

  it.each([
    "The latest session carried the progression story.",
    "One isolated workout covered eleven movement areas.",
    "Training supplied the forward signal.",
    "Photos preserved the visual thread.",
    "Training has earned patience.",
    "Energy needs better observed coverage.",
    "The preview continuation fills the active-goal window.",
    "PI's verdict is to confirm the range.",
    "Body composition is baseline only.",
    "August brings a new assignment.",
  ])("rejects known Monthly editorial regressions: %s", (text) => {
    const model = {
      hero: { title: text, thesis: "You are making progress.", confidenceExplanation: "Keep going.", highlights: [] },
      training: { stats: [] },
      changes: { themes: [] },
      moments: { moments: [] },
      strategy: { items: [] },
      monthAhead: { guidance: [] },
    };
    expect(auditMonthlyNarrativeModel(model).passes).toBe(false);
  });

  it("states photo findings directly and keeps the user as the subject", () => {
    const photo = compose("julyContinuation").monthlyNarrative.moments.moments
      .find((moment) => moment.tone === "photos");
    expect(photo.body).toMatch(/photos do not show noticeable fat gain or muscle gain yet/i);
    expect(photo.body).toMatch(/keep the plan in place.*take photos on schedule/i);
    expect(photo.body).not.toMatch(/report|briefing|story|visual thread|checkpoint/i);
  });

  it("leads Energy with the calorie trend and mentions missing logs only when material", () => {
    const july = compose("julyContinuation").monthlyNarrative.energy.summary;
    const ordinary = compose("ordinaryMonth").monthlyNarrative.energy.summary;
    expect(july).toMatch(/^Your intake is moving closer/i);
    expect(july).toMatch(/nutrition logs are still too incomplete/i);
    expect(ordinary).toMatch(/^Logged days averaged a \d+ calorie deficit/i);
    expect(ordinary).toMatch(/repeatable level for the current workload/i);
    expect(ordinary).not.toMatch(/missing|incomplete|coverage|observed/i);
  });

  it("answers whether the plan should change without exposing PI", () => {
    const strategy = compose("julyContinuation").monthlyNarrative.strategy;
    expect(strategy.title).toMatch(/nothing currently warrants changing course/i);
    expect(strategy.thesis).toMatch(/training is responding well enough.*calories are moving closer/i);
    expect(JSON.stringify(strategy)).not.toMatch(/\bPI\b|verdict|confirm the range|baseline only/i);
  });

  it("teaches a coaching mental model in What Changed instead of cataloging metric roles", () => {
    const training = compose("julyContinuation").monthlyNarrative.changes.themes
      .find((theme) => theme.label === "Training");
    expect(training.body).toMatch(/training is telling us more than the scale.*getting stronger matters more/i);
    expect(training.body).toMatch(/scale and calorie pattern still add useful context/i);
    expect(training.body).toMatch(/no single signal tells the whole story.*next DEXA.*becoming muscle/i);
    expect(training.body).not.toMatch(/scoreboard|judge execution|judge sustainability|monitor pace|movement records.*calorie balance.*scale weight.*DEXA/i);
  });

  it("keeps editorial composition separate from ranking, confidence, and evidence counts", () => {
    const first = compose("julyContinuation");
    const repeated = compose("julyContinuation");
    expect(repeated.editorialDecision).toEqual(first.editorialDecision);
    expect(repeated.hero).toEqual(first.hero);
    expect(repeated.weightStory).toEqual(first.weightStory);
    expect(repeated.provenance).toEqual(first.provenance);
  });
});
