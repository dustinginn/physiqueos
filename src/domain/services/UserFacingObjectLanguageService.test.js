import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditNarrativeObjectLanguage,
  configuredNarrativeCapitalizationTerms,
  findBackendObjectCasingLeaks,
  naturalizeUserFacingNarrativeProjection,
  naturalizeUserFacingNarrativeText,
  resolveUserFacingObjectLanguage,
  USER_FACING_OBJECT_MODES,
} from "./UserFacingObjectLanguageService";

const movement = (displayName, options = {}) =>
  resolveUserFacingObjectLanguage({
    objectType: "exercise",
    canonicalId: `exercise:${displayName}`,
    displayName,
    ...options,
  });

describe("canonical user-facing object language", () => {
  it("preserves canonical identity while exposing all four output modes", () => {
    const canonical = {
      id: "exercise:single_leg_leg_press",
      name: "Single-Leg Leg Press",
      aliases: ["Single Leg Press"],
    };
    const result = resolveUserFacingObjectLanguage({
      objectType: "exercise",
      canonicalId: canonical.id,
      displayName: canonical.name,
      aliases: canonical.aliases,
    });
    expect(result).toMatchObject({
      exactLabel: "Single-Leg Leg Press",
      sentenceReference: "single-leg leg press",
      coachingReference: "single-leg leg press",
      aggregateReference: "lower-body training",
      normalizedCase: "single-leg leg press",
      selectedMode: USER_FACING_OBJECT_MODES.SENTENCE_REFERENCE,
      selectedReference: "single-leg leg press",
      provenance: { canonicalNamePreserved: true },
    });
    expect(canonical).toEqual({
      id: "exercise:single_leg_leg_press",
      name: "Single-Leg Leg Press",
      aliases: ["Single Leg Press"],
    });
  });

  it.each([
    ["Lateral Raises Machine", "machine lateral raises", "plural", "have"],
    ["Pull-Ups", "pull-ups", "plural", "have"],
    ["Single-Leg Leg Press", "single-leg leg press", "singular", "has"],
    ["EZ Bar Curls", "EZ-bar curls", "plural", "have"],
    ["Bulgarian Split Squat", "Bulgarian split squats", "plural", "have"],
    ["Romanian Deadlift", "Romanian deadlift", "singular", "has"],
    ["Smith Machine Squat", "Smith machine squat", "singular", "has"],
    ["RDL", "RDL", "singular", "has"],
  ])("normalizes %s without losing meaningful terms", (
    exactLabel,
    sentenceReference,
    grammaticalNumber,
    have
  ) => {
    expect(movement(exactLabel)).toMatchObject({
      exactLabel,
      sentenceReference,
      grammaticalNumber,
      agreement: { have },
    });
  });

  it("uses aggregate movement language only when requested", () => {
    expect(movement("Lateral Raises Machine", {
      specificity: "aggregate",
    }).selectedReference).toBe("shoulder isolation work");
    expect(movement("Pull-Ups", {
      specificity: "aggregate",
    }).selectedReference).toBe("upper-body pulling");
  });

  it.each([
    ["goal", "Build Lean Mass", "building muscle", "your muscle-building phase"],
    ["goal", "Visible Abs", "reaching visible abs", "your cut"],
    ["phase", "Establish Maintenance", "finding your maintenance intake", "settling into maintenance"],
    ["strategy", "Establish Maintenance", "finding your maintenance intake", "settling into maintenance"],
    ["protocol", "Morning Weigh-In", "your morning weigh-in", "your morning weigh-in"],
    ["protocol", "Progress Photos", "progress photos", "your progress photos"],
    ["protocol", "Tesamorelin", "tesamorelin", "your tesamorelin protocol"],
    ["evidence_event", "Photo Event", "your latest progress photos", "your progress photos"],
    ["evidence_event", "DEXA Event", "your latest DEXA", "the latest scan"],
    ["evidence_event", "Goal Completion", "finishing the goal", "finishing your goal"],
    ["confidence", "Goal Confidence Assessment", "confidence", "how certain we can be"],
  ])("translates %s object %s for narration", (
    objectType,
    displayName,
    sentenceReference,
    coachingReference
  ) => {
    expect(resolveUserFacingObjectLanguage({
      objectType,
      displayName,
    })).toMatchObject({
      exactLabel: displayName,
      sentenceReference,
      coachingReference,
    });
  });

  it("keeps operationally important protocol identity exact", () => {
    expect(resolveUserFacingObjectLanguage({
      objectType: "protocol",
      displayName: "Tesamorelin",
      operationalSpecificity: true,
    }).sentenceReference).toBe("Tesamorelin");
  });

  it("prevents internal event identifiers from becoming prose", () => {
    const result = resolveUserFacingObjectLanguage({
      objectType: "event",
      displayName: "training_performance_event_v1",
    });
    expect(result.sentenceReference).toBe("the latest update");
    expect(result.sentenceReference).not.toContain("_");
  });

  it("audits canonical labels dynamically instead of relying on banned strings", () => {
    const input = {
      canonicalObjects: [{
        objectType: "exercise",
        canonicalId: "exercise:custom",
        displayName: "Zulu Cable Arc",
      }],
    };
    expect(auditNarrativeObjectLanguage({
      ...input,
      narration: ["Zulu Cable Arc improved this week."],
    })).toMatchObject({ passes: false });
    expect(auditNarrativeObjectLanguage({
      ...input,
      narration: ["Zulu cable arc improved this week."],
    })).toMatchObject({ passes: true });
  });

  it("keeps normalization out of JSX and routes high-risk narrative owners through the service", () => {
    const screen = fs.readFileSync("src/screens/MidweekBriefingScreen.jsx", "utf8");
    const midweek = fs.readFileSync(
      "src/domain/services/MidweekBriefingPreviewService.js",
      "utf8"
    );
    const daily = fs.readFileSync(
      "src/domain/services/DailyBriefingService.js",
      "utf8"
    );
    const weekly = fs.readFileSync(
      "src/domain/services/WeeklyNarrativeService.js",
      "utf8"
    );
    expect(screen).not.toMatch(/replace\s*\([^)]*(?:Pull-Ups|Lateral Raises Machine)/);
    expect(midweek).toContain("createMidweekExerciseWatchNarrative");
    expect(midweek).not.toMatch(/message:[^\n]*`\$\{item\.exercise\.name\}/);
    expect(daily).toContain("resolveUserFacingObjectLanguage");
    expect(weekly).toContain("exerciseNarrativeReference");
  });

  it("uses natural casing for ordinary backend concepts without flattening intentional names", () => {
    const preserveTerms = ["Build Lean Mass", "DEXA", "ISO-Lateral High Rows"];
    const input = "The Goal remains in progress in the current Phase. The Guardrail stayed controlled. The Energy picture changed. Goal Confidence remains 79%. Build Lean Mass still uses DEXA, and ISO-Lateral High Rows improved.";
    expect(naturalizeUserFacingNarrativeText(input, { preserveTerms }))
      .toBe("The goal remains in progress in the current phase. The guardrail stayed controlled. The energy picture changed. Goal Confidence remains 79%. Build Lean Mass still uses DEXA, and ISO-Lateral High Rows improved.");
  });

  it("preserves sentence-initial casing, labels, acronyms, named goals and configured evidence", () => {
    const goalContract = {
      goalLabel: "Build Lean Mass",
      phase: { label: "Lean Mass Build" },
      vocabulary: {
        goal: { displayName: "10 lb lean-mass goal" },
        evidence: { requests: { scan: { displayName: "DEXA" } } },
      },
    };
    const output = naturalizeUserFacingNarrativeProjection({
      heading: "Goal Confidence",
      label: "Current Goal Phase",
      prose: "Goal progress is clear. The current Phase remains productive, and the next DEXA matters. ISO-Lateral High Rows improved. Keep body fat inside the 8–9% guardrail.",
      product: "Use the Operating Plan without exposing the Evidence object.",
    }, { preserveTerms: [
      ...configuredNarrativeCapitalizationTerms(goalContract),
      "ISO-Lateral High Rows",
    ] });
    expect(output).toEqual({
      heading: "Goal Confidence",
      label: "Current Goal Phase",
      prose: "Goal progress is clear. The current phase remains productive, and the next DEXA matters. ISO-Lateral High Rows improved. Keep body fat inside the 8–9% guardrail.",
      product: "Use the Operating Plan without exposing the evidence object.",
    });
    expect(findBackendObjectCasingLeaks(output, { preserveTerms: [
      ...configuredNarrativeCapitalizationTerms(goalContract),
      "ISO-Lateral High Rows",
    ] })).toEqual([]);
  });

  it.each([
    ["Build Strength", "The Goal is improving while Training stays consistent.",
      "The goal is improving while training stays consistent."],
    ["Improve Cardio", "The current Phase remains useful because Activity supports the Goal.",
      "The current phase remains useful because activity supports the goal."],
    ["Maintain Weight", "The Guardrail is clear and Weight remains in range.",
      "The guardrail is clear and weight remains in range."],
  ])("normalizes ordinary concepts across Goal type %s", (goalName, input,
    expected) => {
    expect(naturalizeUserFacingNarrativeText(input, {
      preserveTerms: [goalName],
    })).toBe(expected);
  });
});
