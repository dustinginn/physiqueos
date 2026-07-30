import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditNarrativeObjectLanguage,
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
});
