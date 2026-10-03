import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HealthKitWorkoutFamily,
  HealthKitWorkoutStrategicRole as Role,
  assessHealthKitWorkoutStrategicEligibility,
  classifyHealthKitWorkoutType,
  resolveHealthKitWorkoutTypeStrategicRole,
} from "./HealthKitWorkoutService.js";
import {
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  HealthKitGraduationPurpose as Purpose,
  overlayGraduatedHealthKitCardioWorkouts,
  resolveHealthKitGraduationPolicy,
} from "./HealthKitGraduation.js";
import { createV3EvidenceUniverse } from "../intelligence/V3EvidenceUniverse.js";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { createCadenceTrainingPIObservations } from "./CadenceTrainingPIObservationService";
import {
  OCT2_DATE,
  oct2ActivityDayEvidence,
  oct2CanonicalWorkout,
  oct2CooldownInput,
  oct2StairStepperInput,
  oct2WalkInput,
} from "../../fixtures/healthKitOct2StairStepperCooldownFixture.js";

// D1 / D2: canonical workout (history) inclusion and strategic evidence
// eligibility are separate decisions. Cooldown is canonical Cardio-family
// HISTORY only; Stair Stepper is a strategic Cardio candidate under the SAME
// prospective `cardio_training` graduation scope as walk/run/cycle.

const stair = () => oct2CanonicalWorkout(oct2StairStepperInput());
const cooldown = () => oct2CanonicalWorkout(oct2CooldownInput());
const walk = () => oct2CanonicalWorkout(oct2WalkInput());

const graduationPolicy = ({ evidence = true, projection = false, start = "2026-09-25", end = null } = {}) => resolveHealthKitGraduationPolicy({
  schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  projection: projection ? { enabled: true, domains: ["cardio_training"], startLocalDate: start, endLocalDate: end } : { enabled: false },
  evidenceEligibility: evidence ? { enabled: true, domains: ["cardio_training"], startLocalDate: start, endLocalDate: end } : { enabled: false },
  historicalBriefingRegeneration: false,
});
const graduate = (canonicalWorkouts, { purpose = Purpose.EVIDENCE, canonicalObjects = [], policy = graduationPolicy({ projection: true }) } = {}) =>
  overlayGraduatedHealthKitCardioWorkouts({ canonicalObjects, canonicalWorkouts, policy, purpose, timeZone: "America/Los_Angeles" });
const healthKitIds = (objects) => objects.map((object) => object.payload?.provenance?.healthkit_canonical_workout_id).filter(Boolean).sort();

describe("D1/D2 classification: Stair Stepper (44) and Cooldown (80) canonicalize as Cardio-family workouts", () => {
  it("classifies the numeric raw values Native sends", () => {
    expect(classifyHealthKitWorkoutType("44")).toMatchObject({ family: "cardio", canonicalType: "stair_climbing", basis: "numeric_raw_value" });
    expect(classifyHealthKitWorkoutType("80")).toMatchObject({ family: "cardio", canonicalType: "cooldown", basis: "numeric_raw_value" });
  });

  it("classifies only the exact equivalent display names", () => {
    for (const name of ["Stair Stepper", "Stair Climbing", "stairclimbing"]) {
      expect(classifyHealthKitWorkoutType(name), name).toMatchObject({ family: "cardio", canonicalType: "stair_climbing" });
    }
    for (const name of ["Cooldown", "Cool Down"]) {
      expect(classifyHealthKitWorkoutType(name), name).toMatchObject({ family: "cardio", canonicalType: "cooldown" });
    }
    for (const name of ["68", "Stairs", "Stair Climber Machine", "Cooldown Walk Extra"]) {
      expect(String(classifyHealthKitWorkoutType(name).canonicalType), name).not.toMatch(/^(stair_climbing|cooldown)$/);
    }
  });

  it("never lets Apple's indoor signal create a location variant for either type", () => {
    for (const isIndoorWorkout of [true, false, null]) {
      expect(classifyHealthKitWorkoutType("44", { isIndoorWorkout })).toMatchObject({ family: "cardio", canonicalType: "stair_climbing" });
      expect(classifyHealthKitWorkoutType("80", { isIndoorWorkout })).toMatchObject({ family: "cardio", canonicalType: "cooldown" });
    }
    expect(stair().current.canonicalType).toBe("stair_climbing");
  });

  it("stamps the explicit strategic role on the canonical record and keeps every record quarantined and non-additive", () => {
    for (const [record, role] of [[stair(), Role.GRADUATION_CANDIDATE], [cooldown(), Role.HISTORY_ONLY], [walk(), Role.GRADUATION_CANDIDATE]]) {
      expect(record.current.strategicRole).toBe(role);
      expect(record.current.family).toBe(HealthKitWorkoutFamily.CARDIO);
      expect(record.localDate).toBe(OCT2_DATE);
      expect(record.evidenceEligibility).toEqual({ state: "quarantined", strategic: false, decidedBy: "healthkit-strategic-evidence-quarantine-v1" });
      expect(record.activityInteraction).toEqual({ policy: "workout_energy_is_descriptive_never_additive", additiveToDailyActivity: false });
    }
  });

  it("keeps the strategic role out of the semantic fingerprint (descriptive classification, not source telemetry)", () => {
    const record = stair();
    const restamped = oct2CanonicalWorkout(oct2StairStepperInput());
    expect(restamped.semanticFingerprint).toBe(record.semanticFingerprint);
    expect(JSON.stringify(record.revisionHistory)).not.toContain("strategicRole");
  });
});

describe("the strategic-role allowlist (one table, fail-closed)", () => {
  it("names every walk/run/cycle variant and Stair Stepper as graduation candidates", () => {
    for (const canonicalType of ["walking", "indoor_walking", "outdoor_walking", "running", "indoor_running", "outdoor_running",
      "cycling", "indoor_cycling", "outdoor_cycling", "stair_climbing"]) {
      expect(resolveHealthKitWorkoutTypeStrategicRole({ family: "cardio", canonicalType }), canonicalType).toBe(Role.GRADUATION_CANDIDATE);
    }
  });

  it("makes Cooldown, any unnamed type, a wrong family and a malformed record HISTORY_ONLY", () => {
    expect(resolveHealthKitWorkoutTypeStrategicRole({ family: "cardio", canonicalType: "cooldown" })).toBe(Role.HISTORY_ONLY);
    expect(resolveHealthKitWorkoutTypeStrategicRole({ family: "cardio", canonicalType: "elliptical" })).toBe(Role.HISTORY_ONLY);
    expect(resolveHealthKitWorkoutTypeStrategicRole({ family: "strength", canonicalType: "walking" })).toBe(Role.HISTORY_ONLY);
    expect(resolveHealthKitWorkoutTypeStrategicRole({ family: "recovery", canonicalType: "cooldown" })).toBe(Role.HISTORY_ONLY);
    expect(resolveHealthKitWorkoutTypeStrategicRole({})).toBe(Role.HISTORY_ONLY);
    expect(resolveHealthKitWorkoutTypeStrategicRole({ family: "__proto__", canonicalType: "constructor" })).toBe(Role.HISTORY_ONLY);
  });

  it("keeps Strength as Logger telemetry, never independently strategic", () => {
    expect(resolveHealthKitWorkoutTypeStrategicRole({ family: "strength", canonicalType: "traditional_strength_training" })).toBe(Role.LOGGER_TELEMETRY);
    expect(assessHealthKitWorkoutStrategicEligibility({ current: { family: "strength", canonicalType: "traditional_strength_training" } }))
      .toMatchObject({ eligible: false, reason: "logger_telemetry_never_independently_strategic" });
  });
});

describe("assessHealthKitWorkoutStrategicEligibility (the one strategic decision)", () => {
  it("makes Stair Stepper and walks eligible to graduate under cardio_training, and Cooldown never", () => {
    expect(assessHealthKitWorkoutStrategicEligibility(stair())).toEqual({
      eligible: true, role: Role.GRADUATION_CANDIDATE, graduationDomain: "cardio_training", reason: "graduation_candidate_workout_type",
    });
    expect(assessHealthKitWorkoutStrategicEligibility(walk())).toMatchObject({ eligible: true, graduationDomain: "cardio_training" });
    expect(assessHealthKitWorkoutStrategicEligibility(cooldown())).toEqual({
      eligible: false, role: Role.HISTORY_ONLY, graduationDomain: null, reason: "history_only_workout_type",
    });
  });

  it("resolves a legacy record without a stamp from the allowlist alone (existing canonical walks keep graduating)", () => {
    const legacy = walk();
    delete legacy.current.strategicRole;
    expect(assessHealthKitWorkoutStrategicEligibility(legacy)).toMatchObject({ eligible: true });
    const legacyCooldown = cooldown();
    delete legacyCooldown.current.strategicRole;
    expect(assessHealthKitWorkoutStrategicEligibility(legacyCooldown)).toMatchObject({ eligible: false });
  });

  it("lets a stamped role narrow but never widen", () => {
    const narrowed = walk();
    narrowed.current.strategicRole = Role.HISTORY_ONLY;
    expect(assessHealthKitWorkoutStrategicEligibility(narrowed)).toMatchObject({ eligible: false, reason: "stamped_strategic_role_narrows_type" });
    const widened = cooldown();
    widened.current.strategicRole = Role.GRADUATION_CANDIDATE;
    expect(assessHealthKitWorkoutStrategicEligibility(widened)).toMatchObject({ eligible: false, reason: "history_only_workout_type" });
    const unknown = stair();
    unknown.current.strategicRole = "strategic";
    expect(assessHealthKitWorkoutStrategicEligibility(unknown)).toMatchObject({ eligible: false, reason: "stamped_strategic_role_unrecognized" });
    expect(assessHealthKitWorkoutStrategicEligibility(null)).toMatchObject({ eligible: false, reason: "not_a_canonical_workout" });
  });
});

describe("strategic boundary 1: graduation (the only path from a canonical workout into strategic Evidence)", () => {
  it("graduates Stair Stepper as ordinary eligible Cardio Training evidence, like a walk", () => {
    const { objects, applied } = graduate([stair()]);
    expect(applied).toEqual([{ domain: "cardio_training", localDate: OCT2_DATE, mode: "projected_alone", coexistence: null }]);
    expect(objects[0].payload).toMatchObject({
      evidence_type: "training",
      observed_at: OCT2_DATE,
      metadata: { activity_type: "Stair Stepper", duration_seconds: 679, active_calories: 121 },
      evidenceEligibility: { state: "eligible", strategic: true },
      provenance: { healthkit_family: "cardio", healthkit_canonical_type: "stair_climbing" },
    });
  });

  it.each([Purpose.EVIDENCE, Purpose.PROJECTION])("never graduates Cooldown under the %s purpose, even inside the exact scope", (purpose) => {
    expect(graduate([cooldown()], { purpose })).toEqual({ objects: [], applied: [] });
    const mixed = graduate([walk(), stair(), cooldown()], { purpose });
    expect(healthKitIds(mixed.objects)).toEqual([walk().id, stair().id].sort());
    expect(mixed.applied).toHaveLength(2);
  });

  it("is invariant to Cooldown: adding it changes nothing a strategic reader receives", () => {
    const activityDay = oct2ActivityDayEvidence();
    const without = graduate([walk(), stair()], { canonicalObjects: [activityDay] });
    const withCooldown = graduate([walk(), stair(), cooldown()], { canonicalObjects: [activityDay] });
    expect(withCooldown).toEqual(without);
    // The whole-day Activity Evidence object is passed through untouched.
    expect(withCooldown.objects.find((object) => object.canonicalId === activityDay.canonicalId)).toBe(activityDay);
  });

  it("keeps Stair Stepper prospective: outside the cardio_training scope it stays quarantined like any walk", () => {
    expect(graduate([stair()], { policy: graduationPolicy({ start: "2026-10-03" }) })).toEqual({ objects: [], applied: [] });
    expect(graduate([stair()], { policy: graduationPolicy({ evidence: false }) })).toEqual({ objects: [], applied: [] });
  });
});

describe("strategic boundary 2: the V3 evidence universe (Weekly, Midweek, Monthly, DEXA, Photo publishers)", () => {
  const universe = (canonicalEvidenceObjects) => createV3EvidenceUniverse({
    store: { canonicalEvidenceObjects },
    goal: { id: "goal" },
    phase: { id: "phase", startedAt: "2026-09-01" },
    evidenceCutoff: "2026-10-04T06:59:59.999Z",
  });

  it("includes graduated Stair Stepper Training evidence and never Cooldown", () => {
    const { objects } = graduate([walk(), stair(), cooldown()], { canonicalObjects: [oct2ActivityDayEvidence()] });
    const training = universe(objects).canonicalEvidenceObjects;
    expect(training.map((object) => object.payload.metadata.activity_type).sort()).toEqual(["Outdoor Walk", "Stair Stepper"]);
    expect(JSON.stringify(training)).not.toMatch(/cooldown/i);
  });

  it("is identical with or without a canonical Cooldown", () => {
    const base = graduate([walk(), stair()]).objects;
    const withCooldown = graduate([walk(), stair(), cooldown()]).objects;
    expect(universe(withCooldown)).toEqual(universe(base));
  });
});

describe("strategic boundary 3: Training Confidence (cadence Training PI observations)", () => {
  const observations = (canonicalWorkouts) => {
    const sessions = graduate(canonicalWorkouts).objects.map((object) => object.payload);
    const report = createTrainingPerformanceIntelligenceReport({
      trainingSessions: sessions, now: "2026-10-03T12:00:00Z", generatedAt: "2026-10-03T12:00:00.000Z",
    });
    return createCadenceTrainingPIObservations({
      report,
      canonicalTrainingEvidence: sessions,
      cadence: "weekly",
      evidenceWindow: { startDate: "2026-09-27", endDate: "2026-10-03" },
      comparisonWindow: { startDate: "2026-09-20", endDate: "2026-09-26" },
      windowTimeZone: "America/Los_Angeles",
    });
  };

  it("counts graduated Stair Stepper as a Training session and never Cooldown", () => {
    const withCooldown = observations([walk(), stair(), cooldown()]);
    expect(withCooldown).toEqual(observations([walk(), stair()]));
    const overall = withCooldown.find((item) => item.subject.type === "training_scope");
    expect(overall.explanationData.cadenceWindow.currentWindowSessionCount).toBe(2);
    expect(overall.explanationData.cadenceWindow.evidenceIds).toEqual([walk().id, stair().id].sort());
    expect(observations([cooldown()])).toEqual(observations([]));
  });
});

describe("structural: no strategic reader can reach a canonical workout around the strategic-role gate", () => {
  const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
  const walkSource = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "fixtures" || entry.name === "node_modules" ? [] : walkSource(full);
    return /\.(js|jsx|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
  const sources = walkSource(ROOT).map((file) => ({ relative: path.relative(ROOT, file), text: fs.readFileSync(file, "utf8") }));

  it("produces strategic canonical-workout Evidence only in the gated graduation overlay", () => {
    const graduation = sources.find((source) => source.relative === "domain/services/HealthKitGraduation.js").text;
    const overlay = graduation.slice(graduation.indexOf("export function overlayGraduatedHealthKitCardioWorkouts"));
    expect(overlay.slice(0, overlay.indexOf("projectPresentedHealthKitCardioTrainingRecords({")))
      .toContain("assessHealthKitWorkoutStrategicEligibility(workout)");
    // Only the graduation reader calls the overlay (plus the bounded Oct 2
    // repair, which only REPORTS its read-only prediction and never persists
    // it), and only the briefing cadence composition asks the reader for it.
    expect(sources.filter((source) => source.text.includes("overlayGraduatedHealthKitCardioWorkouts(")).map((source) => source.relative).sort())
      .toEqual([
        "domain/services/HealthKitGraduation.js",
        "platform/database/HealthKitGraduationReader.js",
        "platform/operations/HealthKitUnsupportedWorkoutTypeRepairRunner.js",
      ]);
    expect(sources.filter((source) => /\.overlayCardioWorkouts\(/.test(source.text)).map((source) => source.relative))
      .toEqual(["application/composition/providerBriefingCadenceComposition.js"]);
  });

  it("never stamps a canonical workout itself as strategically eligible", () => {
    const service = sources.find((source) => source.relative === "domain/services/HealthKitWorkoutService.js").text;
    expect(service).toContain("evidenceEligibility: createHealthKitQuarantinedEligibility()");
    expect(service).not.toMatch(/strategic:\s*true/);
  });
});
