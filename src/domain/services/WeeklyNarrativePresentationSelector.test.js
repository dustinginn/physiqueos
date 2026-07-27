import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  selectWeeklyNarrativePresentation,
  WEEKLY_NARRATIVE_PRESENTATION_SELECTOR_VERSION,
} from "./WeeklyNarrativePresentationSelector";

const domainConclusions = [
  conclusion("photos", "observed", "stable", "Photos stayed directional.", { authority: "directional" }),
  conclusion("weight", "observed", "neutral", "Weight stayed supporting context."),
  conclusion("energy", "observed", "below", "Energy stayed below maintenance."),
  conclusion("training", "constructive", "positive", "Training improved broadly.", {
    plateauing: ["Back"],
  }),
];

const assessment = {
  id: "pi_narrative|weekly",
  modelVersion: "pi_narrative_assessment_v1",
  completeness: "partial",
  uncertainties: ["partial_energy_coverage"],
  overallConclusion: {
    headline: "Canonical Weekly headline",
    summary: "Canonical Weekly summary",
  },
  primaryFinding: domainConclusions[3],
  domainConclusions,
  recommendation: { text: "Canonical recommendation." },
  nextObservation: { text: "Canonical next observation." },
  provenance: {
    sourceObservationIds: ["o2", "o1"],
    sourceClaimIds: ["c2", "c1"],
    evidenceCutoff: "2026-07-25T23:59:59-07:00",
    confidenceAssessmentId: "confidence-1",
  },
};

const facts = {
  domains: {
    training: { label: "Training", detail: "6 days · 7 improving", icon: "💪" },
    energy: { label: "Energy", detail: "6 of 7 paired days", icon: "🔥" },
    weight: { label: "Weight", detail: "164.4 lb average", icon: "⚖️" },
    photos: { label: "Photos", detail: "1 session", icon: "📸" },
  },
  training: {
    categories: [{
      id: "back",
      label: "Back",
      status: "plateauing",
      statusLabel: "Plateauing",
      comparableExerciseCount: 3,
    }],
  },
};

describe("WeeklyNarrativePresentationSelector", () => {
  it("is the single selection boundary over pi_narrative_assessment_v1", () => {
    const result = selectWeeklyNarrativePresentation({
      assessment,
      facts,
      confidence: { assessmentId: "confidence-1" },
    });
    expect(result.schemaVersion).toBe(WEEKLY_NARRATIVE_PRESENTATION_SELECTOR_VERSION);
    expect(result.assessmentId).toBe(assessment.id);
    expect(result.hero).toMatchObject({
      headline: assessment.overallConclusion.headline,
      summary: assessment.overallConclusion.summary,
    });
    expect(result.training.conclusion).toBe("Training improved broadly.");
    expect(result.training.needsAttention).toEqual([{
      id: "back",
      label: "Back",
      status: "plateauing",
      statusLabel: "Plateauing",
      comparableExerciseCount: 3,
      message: "Plateauing · 3 supporting exercises",
    }]);
    expect(result.interpretation.items.map((item) => item.domain)).toEqual([
      "training",
      "energy",
      "weight",
      "photos",
    ]);
    expect(result.coachInsight).toEqual({
      biggestWin: "Training improved broadly.",
      keepBuilding: "Canonical recommendation.",
      watchNextWeek: "Canonical next observation.",
      actionItems: [
        "Canonical recommendation.",
        "Canonical next observation.",
      ],
    });
  });

  it("uses canonical domain meaning and artifact facts without accepting repositories", () => {
    const result = selectWeeklyNarrativePresentation({
      assessment,
      facts,
      repositories: { canonicalEvidence: { list: () => { throw new Error("must not run"); } } },
      liveEvidence: [{ domain: "training", explanation: "Live override." }],
    });
    expect(result.hero.cards.map((item) => item.headline)).toEqual([
      "Training progressed across most areas.",
      "Below maintenance",
      "Supporting context",
      "Photos looked generally stable.",
    ]);
    expect(JSON.stringify(result)).not.toContain("Live override");
    expect(result.hero.cards[0].detail).toBe("6 days · 7 improving");
  });

  it("is deterministic when domain conclusions are reordered", () => {
    const first = selectWeeklyNarrativePresentation({ assessment, facts });
    const second = selectWeeklyNarrativePresentation({
      assessment: {
        ...assessment,
        domainConclusions: [...assessment.domainConclusions].reverse(),
      },
      facts,
    });
    expect(second).toEqual(first);
  });

  it("preserves historical confidence and explains an intentional domain difference", () => {
    const confidence = {
      assessmentId: "confidence-1",
      score: 58,
      supportingReasons: ["Photos support a stable body-composition guardrail."],
    };
    const result = selectWeeklyNarrativePresentation({ assessment, facts, confidence });
    expect(result.confidence.reference).toBe(confidence);
    expect(result.confidence.alignment.status).toBe("historical_context_differs");
    expect(result.confidence.alignment.context).toMatch(/generation-time assessment/i);
    expect(result.confidence.alignment.context).toMatch(/artifact-owned evidence/i);
  });

  it("degrades factually and omits unsupported conclusions", () => {
    const result = selectWeeklyNarrativePresentation({
      assessment: null,
      facts,
      period: { endDate: "2026-07-25" },
    });
    expect(result.completeness).toBe("limited");
    expect(result.limitations).toContain("canonical_narrative_unavailable");
    expect(result.hero.headline).toBe("");
    expect(result.hero.cards.every((item) => item.headline === "")).toBe(true);
    expect(result.training.conclusion).toBe("");
    expect(result.interpretation.items).toEqual([]);
    expect(result.coachInsight).toEqual({
      biggestWin: "",
      keepBuilding: "",
      watchNextWeek: "",
      actionItems: [],
    });
    expect(result.provenance.evidenceCutoff).toBe("2026-07-25");
  });

  it("keeps downstream Weekly files free of substantive narrative templates", () => {
    const files = [
      "WeeklyBriefingPresentationService.js",
      "WeeklyBriefingScreenPresentationService.js",
      "WeeklyHeroPresentationService.js",
      "WeeklyTrainingPresentationService.js",
    ].map((name) =>
      fs.readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
    );
    const screen = fs.readFileSync(
      new URL("../../screens/WeeklyBriefingScreen.jsx", import.meta.url),
      "utf8"
    );
    const downstream = [...files, screen].join("\n");
    for (const prohibited of [
      "broadly constructive despite",
      "continue the current Training plan",
      "one plateau does not make the week regressive",
      "Daily scale movement remains supporting context",
      "added useful coaching context",
      "evidence develops",
    ]) {
      expect(downstream).not.toContain(prohibited);
    }
  });

  it("owns the canonical watch selection instead of delegating it to Training facts", () => {
    const trainingSource = fs.readFileSync(
      new URL("./WeeklyTrainingPresentationService.js", import.meta.url),
      "utf8"
    );
    const screenSource = fs.readFileSync(
      new URL("./WeeklyBriefingScreenPresentationService.js", import.meta.url),
      "utf8"
    );
    expect(trainingSource).not.toContain("needsAttention");
    expect(trainingSource).not.toContain("training_performance_does_not_establish_tissue_gain");
    expect(screenSource).toContain("trainingSelection.needsAttention");
    expect(screenSource).not.toContain("trainingFacts.needsAttention");
  });
});

function conclusion(domain, status, direction, explanation, extra = {}) {
  return {
    domain,
    status,
    direction,
    explanation,
    strength: "moderate",
    limitations: [],
    claimReferences: [`claim-${domain}`],
    evidenceBasis: [`evidence-${domain}`],
    lifecycle: "relevant",
    ...extra,
  };
}
