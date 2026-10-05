import { describe, expect, it } from "vitest";
import { overlayAcceptedProcessing } from "../../application/log/LogReadService.js";
import {
  LOGGED_TODAY_SOURCE_KINDS,
  composeLoggedTodaySummary,
  withAppleHealthLineSource,
} from "./LoggedTodayService";

// Typed Log Sources provenance (Batch 2 D1). Clients present sources from these
// fields only; display strings (`context`) are never parsed for provenance.
const dateKey = "2026-10-03";
const APPLE = { kind: "apple_health", label: "Apple Health" };
const LOGGER = { kind: "physiqueos_logger", label: "PhysiqueOS Logger" };
const UNAVAILABLE = { kind: "unavailable", label: "Source unavailable" };

const canonical = (canonicalId, payload) => ({
  canonicalId, evidence_type: payload.evidence_type, lastObservedAt: payload.observed_at,
  payload, quality: { status: "active" },
});
const loggerStrength = () => canonical("strength-1", {
  id: "strength-1", evidence_type: "training", observed_at: dateKey,
  metadata: { activity_type: "Traditional Strength Training", duration_seconds: 3840, logger_origin: "training_logger" },
  exercises: [{ id: "bench" }],
});
const screenshotStrength = () => canonical("strength-shot", {
  id: "strength-shot", evidence_type: "training", observed_at: dateKey,
  source: { modality: "screenshot", application: "Apple Fitness" },
  metadata: { activity_type: "Traditional Strength Training", duration_seconds: 1800 },
  exercises: [{ id: "row" }],
});
const stairStepper = () => ({
  id: "stair-1", _canonicalId: "stair-1", evidence_type: "training", observed_at: dateKey,
  captured_at: `${dateKey}T18:10:00-07:00`, metadata: { activity_type: "Stair Stepper", duration_seconds: 780 },
});
const appleNutrition = () => canonical("nutrition-day", {
  id: "nutrition-1", evidence_type: "nutrition", observed_at: dateKey,
  source: { application: "Apple Health", modality: "integration" },
  metadata: { meal_count: 0 }, meals: [],
  daily_totals: { calories: 2516, protein_g: 215, carbs_g: 161, fat_g: 111 },
});
const screenshotNutrition = () => canonical("nutrition-day", {
  id: "nutrition-2", evidence_type: "nutrition", observed_at: dateKey,
  source: { application: "Apple Fitness", modality: "screenshot" },
  metadata: { meal_count: 3 }, meals: [{}, {}, {}], daily_totals: { calories: 2100 },
});
const appleActivity = () => canonical("activity-1", {
  id: "activity-1", evidence_type: "activity_day", observed_at: dateKey,
  source: { application: "Apple Health", modality: "integration" },
  daily_activity: { move_calories: 771 }, metadata: { coverage: "partial_day" },
});

describe("Logged Today typed provenance", () => {
  it("attributes a realistic mixed-source day truthfully", () => {
    const { rows } = composeLoggedTodaySummary({
      dateKey,
      canonicalObjects: [loggerStrength(), appleNutrition(), appleActivity()],
      cardioWorkouts: [stairStepper()],
    });
    const [training, nutrition, activity] = rows;
    expect(training.provenance).toBeNull();
    expect(training.lines.map((line) => line.provenance)).toEqual([
      { scope: "Strength Training", sources: [LOGGER] },
      { scope: "Stair Stepper", sources: [APPLE] },
    ]);
    expect(nutrition.provenance).toEqual({ scope: "Nutrition", sources: [APPLE] });
    expect(activity.provenance).toEqual({ scope: "Activity", sources: [APPLE] });
  });

  it("separates the source caption from tile detail without changing legacy context", () => {
    const { rows } = composeLoggedTodaySummary({
      dateKey,
      canonicalObjects: [loggerStrength(), appleNutrition(), appleActivity()],
      cardioWorkouts: [stairStepper()],
    });
    // Legacy clients keep the exact prior display strings.
    expect(rows[1].context).toBe("215P · 161C · 111F · Apple Health");
    expect(rows[2].context).toBe("Apple Health");
    // Provenance-aware clients get the same detail without the caption.
    expect(rows[1].contextDetail).toBe("215P · 161C · 111F");
    expect(rows[2].contextDetail).toBeNull();
    expect(rows[0].contextDetail).toBeNull();
    expect(JSON.stringify(rows.map((row) => row.contextDetail))).not.toContain("Apple Health");
  });

  it("keeps non-provenance detail such as Movements not added", () => {
    const strength = canonical("strength-2", {
      id: "strength-2", evidence_type: "training", observed_at: dateKey,
      metadata: { activity_type: "Traditional Strength Training", duration_seconds: 1200, logger_origin: "training_logger" },
      exercises: [],
    });
    const [training] = composeLoggedTodaySummary({ dateKey, canonicalObjects: [strength] }).rows;
    expect(training.context).toBe("Movements not added");
    expect(training.contextDetail).toBe("Movements not added");
  });

  it("never claims Apple Health or the Logger for unprovable sources", () => {
    const { rows } = composeLoggedTodaySummary({
      dateKey,
      canonicalObjects: [screenshotStrength(), screenshotNutrition()],
    });
    expect(rows[0].lines[0].provenance).toEqual({ scope: "Strength Training", sources: [UNAVAILABLE] });
    expect(rows[1].provenance).toEqual({ scope: "Nutrition", sources: [UNAVAILABLE] });
    expect(rows[1].contextDetail).toBeNull();
  });

  it("lists every distinct source of a combined Strength line once", () => {
    const { rows } = composeLoggedTodaySummary({
      dateKey,
      canonicalObjects: [loggerStrength(), screenshotStrength()],
    });
    expect(rows[0].lines[0].provenance.sources).toEqual([LOGGER, UNAVAILABLE]);
  });

  it("gives empty rows no provenance", () => {
    const { rows } = composeLoggedTodaySummary({ dateKey, canonicalObjects: [] });
    expect(rows.map((row) => row.provenance)).toEqual([null, null, null]);
    expect(rows.map((row) => row.contextDetail)).toEqual([null, null, null]);
  });

  it("uses only the published source kinds", () => {
    const { rows } = composeLoggedTodaySummary({
      dateKey,
      canonicalObjects: [loggerStrength(), screenshotStrength(), appleNutrition(), appleActivity()],
      cardioWorkouts: [stairStepper()],
    });
    const kinds = [
      ...rows.flatMap((row) => row.provenance?.sources ?? []),
      ...rows.flatMap((row) => (row.lines ?? []).flatMap((line) => line.provenance?.sources ?? [])),
    ].map((source) => source.kind);
    expect(kinds.every((kind) => LOGGED_TODAY_SOURCE_KINDS.includes(kind))).toBe(true);
  });

  it("adds Apple Health to a typed line once and leaves untyped lines untouched", () => {
    const typed = { id: "training:logger", kind: "logger", provenance: { scope: "Strength Training", sources: [LOGGER] } };
    const once = withAppleHealthLineSource(typed);
    expect(once.provenance.sources).toEqual([LOGGER, APPLE]);
    expect(withAppleHealthLineSource(once).provenance.sources).toEqual([LOGGER, APPLE]);
    const legacy = { id: "training:logger", kind: "logger" };
    expect(withAppleHealthLineSource(legacy)).toBe(legacy);
  });

  it("keeps the processing status visible to provenance-aware clients", () => {
    const loggedToday = composeLoggedTodaySummary({ dateKey, canonicalObjects: [] });
    const overlaid = overlayAcceptedProcessing(loggedToday, [{ localDate: dateKey, domain: "nutrition" }], dateKey);
    expect(overlaid.rows[1]).toMatchObject({
      summary: "Nutrition processing",
      context: "Confirmation accepted · No action required",
      contextDetail: "Confirmation accepted · No action required",
      provenance: null,
      processing: true,
    });
  });
});
