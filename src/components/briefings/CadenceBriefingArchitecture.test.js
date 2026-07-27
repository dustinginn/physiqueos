import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { selectWeeklyNarrativePresentation } from "../../domain/services/WeeklyNarrativePresentationSelector";

const weekly = fs.readFileSync(
  new URL("../../screens/WeeklyBriefingScreen.jsx", import.meta.url),
  "utf8"
);
const midweek = fs.readFileSync(
  new URL("../../screens/MidweekBriefingScreen.jsx", import.meta.url),
  "utf8"
);
const primitives = fs.readFileSync(
  new URL("./CadenceBriefingPrimitives.jsx", import.meta.url),
  "utf8"
);
const confidenceAnchor = fs.readFileSync(
  new URL("./BriefingConfidenceAnchor.jsx", import.meta.url),
  "utf8"
);
const schedule = fs.readFileSync(
  new URL("../../../docs/NARRATIVE_SCHEDULE.md", import.meta.url),
  "utf8"
);

describe("canonical cadence briefing architecture", () => {
  it("keeps Weekly in the canonical completed-week section order", () => {
    const labels = [
      'testId="weekly-hero"',
      "<WeeklyEnergy",
      "<WeeklyWeight",
      "<WeeklyPhotos",
      "<WeeklyTraining",
      "<WeeklyBodyComposition",
      "<WeeklyCoachTake",
    ];
    const positions = labels.map((label) => weekly.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("shares cadence Hero, card, Energy, Training, body composition, and coaching families", () => {
    expect(weekly).toContain("CadenceBriefingHero");
    expect(midweek).toContain("CadenceBriefingHero");
    expect(weekly).toContain("BriefingFeatureCard");
    expect(midweek).toContain("BriefingFeatureCard");
    expect(weekly).toContain("EnergyBalanceChart");
    expect(midweek).toContain("EnergyBalanceChart");
    expect(weekly).toContain("TrainingPerformanceHighlights");
    expect(midweek).toContain("TrainingPerformanceHighlights");
    expect(weekly).toContain("coach-take-card");
    expect(midweek).toContain("coach-take-card");
    expect(weekly).toContain('label="Body Composition"');
    expect(midweek).toContain('label="Body Composition"');
    expect(primitives).toContain("BriefingSectionHeading");
  });

  it("keeps confidence legible without drawing screen-reader copy inside the ring", () => {
    expect(confidenceAnchor).toContain("grid-cols-[104px_minmax(0,1fr)]");
    expect(confidenceAnchor).toContain("showLabel={false}");
    expect(confidenceAnchor).toContain("size={96}");
  });

  it("integrates interpretation in Training, Energy, Weight, and Photos order", () => {
    const presentation = selectWeeklyNarrativePresentation({
      assessment: {
        id: "assessment",
        modelVersion: "pi_narrative_assessment_v1",
        completeness: "available",
        overallConclusion: { summary: "Canonical synthesis." },
        primaryFinding: {
          domain: "training",
          explanation: "Canonical Training conclusion.",
        },
        domainConclusions: [
          { domain: "photos", explanation: "Canonical Photos conclusion." },
          { domain: "weight", explanation: "Canonical Weight conclusion." },
          { domain: "energy", explanation: "Canonical Energy conclusion." },
          { domain: "training", explanation: "Canonical Training conclusion." },
        ],
        provenance: {},
      },
    });
    expect(
      presentation.interpretation.items.map((section) => section.key)
    ).toEqual(["training", "energy", "weight", "photos"]);
    expect(JSON.stringify(presentation)).not.toMatch(
      /relationship|measured domains|shared evidence|signals|domain changes/i
    );
  });

  it("documents one Daily/Midweek/Weekly family and explicit Monthly separation", () => {
    expect(schedule).toMatch(/Daily, Midweek, and Weekly are one briefing family/);
    expect(schedule).toMatch(/future Midweek presentation improvement should flow into Weekly/);
    expect(schedule).toMatch(/Monthly is intentionally separate/);
    expect(schedule).toMatch(/magazine-like.*chapter-based.*story-driven/);
  });
});
