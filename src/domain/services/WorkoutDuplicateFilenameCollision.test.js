import { describe, expect, it } from "vitest";
import {
  assessWorkoutDuplicatePair,
  getWorkoutDuplicateIdentityKey,
  getWorkoutIdentityFacts,
  isBareDisplayFilename,
} from "./WorkoutDuplicateIdentityService";
import { reconcileEvidencePackageIntoCanonicalHistory } from "./CanonicalEvidenceService";

// Native names every Health screenshot "Apple Health Screenshot N.jpg" on every
// day. The Founder's Sep 13 Logger workout was superseded into Sep 15 evidence,
// then into Sep 17, purely because those bare filenames matched.
const REPEATING_FILENAME = "Apple Health Screenshot 2.jpg";

function loggerSession({ date, draftId, refs, start, end, durationSeconds, activeCalories, exercises }) {
  return {
    id: `training_logger_session_${draftId}`,
    evidence_type: "training",
    observed_at: date,
    source: {
      modality: "mixed",
      application: "Training Logger + Apple Fitness",
      source_artifact_refs: [`training_logger_draft_${draftId}`, ...refs],
    },
    metadata: {
      activity_type: "Traditional Strength Training",
      start_time: start,
      end_time: end,
      duration_seconds: durationSeconds,
      active_calories: activeCalories,
    },
    provenance: { source_artifact_refs: [`training_logger_draft_${draftId}`, ...refs] },
    reconciliation: { canonical_id: `training|authoritative|training_logger_draft_${draftId}` },
    exercises,
  };
}

const exercise = (name, sets = 4) => ({ name, canonicalExerciseId: name.toLowerCase().replace(/\W+/g, "_"), sets: Array.from({ length: sets }, () => ({ reps: 10, weight: 100 })) });

const sep13 = () => loggerSession({
  date: "2026-09-13", draftId: "ABB72390-C0D9-46B5-9F3F-939BA2820487", refs: [REPEATING_FILENAME],
  start: "15:44:00", end: "17:21:00", durationSeconds: 5825, activeCalories: 578,
  exercises: [exercise("Pull-Ups"), exercise("Hanging Leg Raises"), exercise("Iso-Lateral High Rows")],
});
const sep17 = () => loggerSession({
  date: "2026-09-17", draftId: "20A8DDEE-E0E8-42DD-8A27-0CB180743F40", refs: [REPEATING_FILENAME],
  start: "07:38:00", end: "08:37:00", durationSeconds: 3533, activeCalories: 373,
  exercises: [exercise("Hip Thrusts"), exercise("Glute Squats")],
});
const sep19 = () => loggerSession({
  date: "2026-09-19", draftId: "42B1C76E-D584-4791-B688-286DDF892229", refs: [REPEATING_FILENAME],
  start: "2026-09-19T15:01:00-07:00", end: "2026-09-19T16:17:00-07:00", durationSeconds: 4563, activeCalories: 329,
  exercises: [exercise("Cable Pushdowns"), exercise("Incline Dumbbell Press")],
});

function appleTelemetry({ date, refs, start, end, durationSeconds, activeCalories }) {
  return {
    id: `telemetry_${date}`,
    evidence_type: "training",
    observed_at: date,
    source: { modality: "screenshot", application: "Apple Fitness", source_artifact_refs: refs },
    metadata: {
      activity_type: "Traditional Strength Training",
      start_time: start,
      end_time: end,
      duration_seconds: durationSeconds,
      active_calories: activeCalories,
    },
    provenance: { source_artifact_refs: refs },
    exercises: [],
  };
}

describe("cross-date display filename collisions", () => {
  it("classifies a bare display filename as weak and scoped refs as stable artifact identity", () => {
    expect(isBareDisplayFilename(REPEATING_FILENAME)).toBe(true);
    expect(isBareDisplayFilename("IMG_1688.png")).toBe(true);
    expect(isBareDisplayFilename("evidence_submission_ABC_images_file_2")).toBe(false);
    expect(isBareDisplayFilename("evidence_submission_ABC_images_file_4_IMG_2026.png")).toBe(false);
    expect(isBareDisplayFilename("training_logger_draft_ABB72390-C0D9-46B5-9F3F-939BA2820487")).toBe(false);
    expect(isBareDisplayFilename("typed_evidence_0")).toBe(false);

    const facts = getWorkoutIdentityFacts(sep13());
    expect(facts.displayFilenames).toEqual([REPEATING_FILENAME]);
    expect(facts.authoritativeIds).not.toContain(REPEATING_FILENAME);
    expect(facts.authoritativeIds).toContain("training_logger_draft_ABB72390-C0D9-46B5-9F3F-939BA2820487");
  });

  it.each([
    ["Sep 13 and Sep 17", sep13, sep17],
    ["Sep 13 and Sep 19", sep13, sep19],
    ["Sep 17 and Sep 19", sep17, sep19],
  ])("scores %s as different workouts despite the shared filename", (_label, left, right) => {
    const result = assessWorkoutDuplicatePair(left(), right());
    expect(result.outcome).toBe("not_duplicate");
    expect(result.signals.authoritative).toEqual([]);
    expect(result.signals.displayFilenames).toEqual([REPEATING_FILENAME]);
    expect(result.reasons.join(" ")).toMatch(/Different workout dates/);
    expect(result.reasons.join(" ")).toMatch(/display filename ignored across different workout dates/i);
  });

  it("does not let a telemetry object that only shares the filename supersede a Logger session on another date", () => {
    const sep15Telemetry = appleTelemetry({
      date: "2026-09-15", refs: [REPEATING_FILENAME],
      start: "2026-09-15T07:58:00-07:00", end: "2026-09-15T08:55:00-07:00", durationSeconds: 3457, activeCalories: 288,
    });
    expect(assessWorkoutDuplicatePair(sep13(), sep15Telemetry).outcome).toBe("not_duplicate");
    expect(getWorkoutDuplicateIdentityKey(sep15Telemetry)).toBe(
      `training|filename|2026-09-15|${REPEATING_FILENAME}`
    );
    expect(getWorkoutDuplicateIdentityKey(sep15Telemetry)).not.toBe(
      getWorkoutDuplicateIdentityKey(appleTelemetry({
        date: "2026-09-13", refs: [REPEATING_FILENAME],
        start: "15:44:00", end: "17:21:00", durationSeconds: 5825, activeCalories: 578,
      }))
    );
  });

  it("keeps Sep 13, Sep 17 and Sep 19 active when Sep 15 evidence reusing the filename is reconciled", () => {
    const existing = [sep13(), sep17(), sep19()].map((payload) => ({
      canonicalId: payload.reconciliation.canonical_id,
      evidence_type: "training",
      userId: "founder",
      quality: { status: "active" },
      payload,
      provenance: { source_artifact_refs: payload.provenance.source_artifact_refs },
    }));
    const incoming = appleTelemetry({
      date: "2026-09-15", refs: [REPEATING_FILENAME],
      start: "2026-09-15T07:58:00-07:00", end: "2026-09-15T08:55:00-07:00", durationSeconds: 3457, activeCalories: 288,
    });
    const result = reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: {
        package_id: "evidence_submission_CDA0400DF634424D9D9D5D93802E9DB1_images",
        evidence_objects: [incoming],
        provenance: { source_artifacts: [] },
      },
      existingCanonicalObjects: existing,
      userId: "founder",
    });
    const active = result.filter((object) => object.quality?.status !== "superseded");
    const superseded = result.filter((object) => object.quality?.status === "superseded");
    expect(superseded).toEqual([]);
    expect(active.map((object) => object.payload.observed_at).sort()).toEqual([
      "2026-09-13", "2026-09-15", "2026-09-17", "2026-09-19",
    ]);
  });

  it("still resolves a same-date duplicate that shares a strong artifact identity (Sep 14 @507/@509)", () => {
    const structured = loggerSession({
      date: "2026-09-14", draftId: "A5936FA6-FEE7-4BAA-9D84-9E0034BDC8A6",
      refs: ["evidence_submission_9B9B0363B6E34A599A1DF27070FA23D4_images_file_2"],
      start: "07:45", end: "08:44", durationSeconds: 3518, activeCalories: 438,
      exercises: [exercise("Leg Press")],
    });
    const telemetry = appleTelemetry({
      date: "2026-09-14",
      refs: ["evidence_submission_9B9B0363B6E34A599A1DF27070FA23D4_images_file_2"],
      start: "07:45", end: "08:44", durationSeconds: 3518, activeCalories: 438,
    });
    const result = assessWorkoutDuplicatePair(structured, telemetry);
    expect(result.outcome).toBe("duplicate");
    expect(result.confidence).toBe(100);
    expect(result.signals.authoritative).toEqual([
      "evidence_submission_9B9B0363B6E34A599A1DF27070FA23D4_images_file_2",
    ]);
  });

  it("still reconciles a same-date re-ingest against a legacy-shape filename canonical id", () => {
    const evidence = () => ({
      id: "strength-july-27", evidence_type: "training", observed_at: "2026-07-27",
      source: { modality: "screenshot", application: "Apple Fitness", source_artifact_refs: ["IMG_1688.png"] },
      provenance: { source_artifact_refs: ["IMG_1688.png"] },
      metadata: { activity_type: "Traditional Strength Training", start_time: "07:09", end_time: "08:00", duration_seconds: 3053, active_calories: 215 },
      exercises: [],
    });
    const legacyId = "training|authoritative|IMG_1688.png";
    const legacy = {
      canonicalId: legacyId, evidence_type: "training", userId: "founder", quality: { status: "active" },
      provenance: { source_artifact_refs: ["IMG_1688.png"] }, payload: evidence(),
    };
    const result = reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: { package_id: "package_reingest", evidence_objects: [evidence()], provenance: { source_artifacts: [] } },
      existingCanonicalObjects: [legacy], userId: "founder",
    });
    // The legacy record is corroborated (same window, duration, calories) and merged, never forked.
    expect(result.filter((object) => object.quality?.status !== "superseded")).toHaveLength(1);
  });

  it("uses a same-date shared filename only as weak support that needs corroboration", () => {
    const morning = appleTelemetry({
      date: "2026-09-21", refs: [REPEATING_FILENAME],
      start: "07:00", end: "08:00", durationSeconds: 3600, activeCalories: 400,
    });
    const evening = appleTelemetry({
      date: "2026-09-21", refs: [REPEATING_FILENAME],
      start: "18:00", end: "19:00", durationSeconds: 3600, activeCalories: 300,
    });
    // Two real workouts the same day whose screenshots were both named "…2.jpg".
    expect(assessWorkoutDuplicatePair(morning, evening).outcome).not.toBe("duplicate");

    // The same screenshot uploaded twice is still recognised.
    const retry = structuredClone(morning);
    retry.id = "telemetry_retry";
    const reupload = assessWorkoutDuplicatePair(morning, retry);
    expect(reupload.outcome).toBe("duplicate");
    expect(reupload.signals.authoritative).toEqual([]);
    expect(reupload.signals.filenamePoints).toHaveLength(1);
  });
});
