import { describe, expect, it } from "vitest";
import { monthlyPreviewFixtures } from "../../fixtures/monthlyBriefingPreview";
import { composeMonthlyBriefingPreview } from "./MonthlyBriefingPreviewService";
import {
  auditMonthlyNarrativeModel,
  composeMonthlyNarrativeModel,
  createMonthlyChronologyContext,
} from "./MonthlyNarrativeCompositionService";

const FIXED_GENERATED_AT = "2026-07-30T20:00:00.000Z";

function compose(name) {
  return composeMonthlyBriefingPreview({
    ...monthlyPreviewFixtures[name],
    generatedAt: FIXED_GENERATED_AT,
  });
}

describe("canonical Monthly coaching narrative", () => {
  const composeWindow = ({ startDate, endDate, deliveryDate, scanDate }) => composeMonthlyNarrativeModel({
    confidence: null,
    decision: {
      candidates: [
        {
          storyType: "dexa_baseline",
          included: true,
          provenance: {
            scanId: `dexa-${scanDate}`,
            scanDate,
            bodyFat: 7.6,
            leanMass: 148.3,
            fatMass: 12.8,
            totalMass: 168.3,
            restingMetabolicRate: 1803,
          },
        },
        {
          storyType: "energy_trend",
          included: true,
          storyWindow: { startDate, endDate },
        },
        {
          storyType: "training_evolution",
          included: true,
          provenance: { improvingCount: 3 },
          storyWindow: { startDate, endDate },
        },
        {
          storyType: "weight_context",
          included: true,
          provenance: { startWeight: 167.5, endWeight: 167.4 },
          storyWindow: { startDate, endDate },
        },
        {
          storyType: "photo_progression",
          included: true,
          storyWindow: { startDate, endDate },
        },
      ],
    },
    evidence: {
      previewWindow: { startDate, endDate, deliveryDate },
      goal: {
        id: "goal-build-lean-mass",
        phases: [{ id: "phase-build", name: "Build Lean Mass", startDate, status: "active" }],
      },
      energyContinuations: [
        { date: startDate, balance: -220 },
        { date: `${startDate.slice(0, 8)}15`, balance: -190 },
        { date: endDate, balance: -180 },
      ],
      trainingPerformanceEvents: [],
    },
  });

  it("derives the authoritative month context from the persisted window", () => {
    expect(createMonthlyChronologyContext({
      evidence: {
        previewWindow: {
          startDate: "2026-08-01",
          endDate: "2026-08-31",
          deliveryDate: "2026-09-01",
        },
        goal: {
          id: "goal-build-lean-mass",
          phases: [{ id: "phase-build", startDate: "2026-07-18", status: "active" }],
        },
      },
      baseline: { provenance: { scanDate: "2026-08-15" } },
    })).toEqual({
      reportingMonth: "2026-08",
      reportingMonthLabel: "August",
      priorMonth: "2026-07",
      priorMonthLabel: "July",
      nextMonth: "2026-09",
      nextMonthLabel: "September",
      windowStart: "2026-08-01",
      windowEnd: "2026-08-31",
      deliveryDate: "2026-09-01",
      deliveryMonth: "2026-09",
      deliveryMonthLabel: "September",
      goalIdentity: "goal-build-lean-mass",
      phaseIdentity: "phase-build",
      phaseStart: "2026-07-18",
      selectedDexaDate: "2026-08-15",
    });
  });

  it("uses August for completed evidence, September for forward guidance, and the Aug 15 DEXA role", () => {
    const narrative = composeWindow({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      deliveryDate: "2026-09-01",
      scanDate: "2026-08-15",
    });
    const rendered = JSON.stringify(narrative);
    expect(narrative.hero.title).toMatch(/August established/i);
    expect(narrative.hero.thesis).toMatch(/September needs/i);
    expect(narrative.moments.title).toMatch(/August/i);
    expect(narrative.newBaseline.summary).toMatch(/August 15 DEXA/i);
    expect(narrative.newBaseline).toMatchObject({
      title: expect.stringMatching(/August established/i),
    });
    expect(rendered).not.toMatch(/July (?:established|produced|defined|should|needs|brings)/i);
  });

  it("keeps July as July and derives September/October without source changes", () => {
    const july = composeWindow({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      deliveryDate: "2026-08-01",
      scanDate: "2026-07-18",
    });
    const september = composeWindow({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      deliveryDate: "2026-10-01",
      scanDate: "2026-09-15",
    });
    expect(july.hero.title).toMatch(/July established/i);
    expect(july.hero.thesis).toMatch(/August needs/i);
    expect(september.hero.title).toMatch(/September established/i);
    expect(september.hero.thesis).toMatch(/October needs/i);
    expect(september.moments.title).toMatch(/September/i);
  });

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
