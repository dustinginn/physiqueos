import { afterEach, describe, expect, it, vi } from "vitest";
import { projectConfirmedHealthKitLogProvenance } from "../../application/core/CoreNavigationReadService.js";
import { createProviderActivityEvidenceReport } from "./ProgressReportingService.js";
import {
  indexConfirmedHealthKitWorkoutAttachments,
  indexWholeDayEligibleHealthKitWorkoutsByDate,
  projectConfirmedHealthKitWorkoutAttachments,
  projectHealthKitStrengthWorkoutPresentationBySession,
  projectWholeDayEligibleHealthKitWorkouts,
} from "./HealthKitWorkoutPresentationService.js";
import { createSep23StrengthPresentationFixture } from "../../fixtures/healthKitSep23StrengthPresentationFixture.js";
import { createSep24StrengthPresentationFixture } from "../../fixtures/healthKitSep24StrengthPresentationFixture.js";
import { createCardioWholeDayAttributionFixture } from "../../fixtures/healthKitCardioWholeDayAttributionFixture.js";
import { createTrainingNavigationReadService } from "../../application/training/TrainingNavigationReadService.js";
import { composeLoggedTodaySummary } from "./LoggedTodayService.js";
import {
  HealthKitStrengthMatchOutcome,
  assessHealthKitStrengthLinkCandidates,
  getHealthKitWorkoutLinkRecordId,
} from "./HealthKitWorkoutLinkService.js";
import { getHealthKitWorkoutLinkClaimId } from "./HealthKitWorkoutRelationshipService.js";

describe("confirmed HealthKit workout presentation", () => {
  it("projects the production-shaped September 23 confirmation without changing Logger detail", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const before = structuredClone(fixture.canonicalEvidenceObjects);
    const attachments = projectConfirmedHealthKitWorkoutAttachments(fixture);
    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);

    expect(attachments).toHaveLength(1);
    expect(logger.payload.id).toBe("training_logger_session_E0E5F723-E306-4CC1-9D35-7F867514A406");
    expect(logger.payload.id).not.toBe(logger.canonicalId);
    expect(attachments[0]).toMatchObject({
      canonicalWorkoutId: fixture.ids.workout,
      loggerSessionCanonicalId: fixture.ids.session,
      family: "strength",
      relationship: {
        status: "confirmed",
        contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" },
      },
      source: { application: "Apple Health", sourceName: "Apple Watch" },
      // Option A: the Logger owns the window (this legacy fixture is
      // start-only, so end/duration stay missing -- never Apple's 17:00-18:00).
      session: {
        startedAt: "2026-09-23T17:01:00.000Z", endedAt: null, durationSeconds: null,
        activeCalories: 410, averageHeartRate: 122,
      },
    });
    expect(fixture.canonicalEvidenceObjects).toEqual(before);
    expect(JSON.stringify(attachments)).not.toContain("externalId");
    expect(JSON.stringify(attachments)).not.toContain("statusHistory");
    expect(JSON.stringify(attachments)).not.toContain("evidenceEligibility");
  });

  it("fails closed for an unconfirmed link or an incomplete one-to-one claim graph", () => {
    const candidate = createSep23StrengthPresentationFixture();
    candidate.workoutLinks[0].status = "candidate";
    candidate.workoutLinks[0].statusHistory = [candidate.workoutLinks[0].statusHistory[0]];
    candidate.workoutLinks[0].updatedAt = candidate.workoutLinks[0].createdAt;
    candidate.workoutLinkClaims = [];
    expect(projectConfirmedHealthKitWorkoutAttachments(candidate)).toEqual([]);

    const missingClaim = createSep23StrengthPresentationFixture();
    missingClaim.workoutLinkClaims.pop();
    expect(projectConfirmedHealthKitWorkoutAttachments(missingClaim)).toEqual([]);
  });

  it("fails closed if the canonical workout leaves quarantine or becomes additive", () => {
    const strategic = createSep23StrengthPresentationFixture();
    strategic.canonicalWorkouts[0].evidenceEligibility = { state: "eligible", strategic: true };
    expect(projectConfirmedHealthKitWorkoutAttachments(strategic)).toEqual([]);

    const additive = createSep23StrengthPresentationFixture();
    additive.canonicalWorkouts[0].activityInteraction.additiveToDailyActivity = true;
    expect(projectConfirmedHealthKitWorkoutAttachments(additive)).toEqual([]);

    const wrongPolicy = createSep23StrengthPresentationFixture();
    wrongPolicy.canonicalWorkouts[0].activityInteraction.policy = "add_workout_energy";
    expect(projectConfirmedHealthKitWorkoutAttachments(wrongPolicy)).toEqual([]);

    const wrongDecisionAuthority = createSep23StrengthPresentationFixture();
    wrongDecisionAuthority.canonicalWorkouts[0].evidenceEligibility.decidedBy = "other-policy";
    expect(projectConfirmedHealthKitWorkoutAttachments(wrongDecisionAuthority)).toEqual([]);
  });

  it("fails closed for Cardio, corrupt link authority/quarantine, or an untrusted Logger session", () => {
    const cardio = createSep23StrengthPresentationFixture();
    cardio.canonicalWorkouts[0].current.family = "cardio";
    cardio.canonicalWorkouts[0].current.canonicalType = "running";
    expect(projectConfirmedHealthKitWorkoutAttachments(cardio)).toEqual([]);

    const strategicLink = createSep23StrengthPresentationFixture();
    strategicLink.workoutLinks[0].evidenceEligibility = { state: "eligible", strategic: true };
    expect(projectConfirmedHealthKitWorkoutAttachments(strategicLink)).toEqual([]);

    const wrongAuthority = createSep23StrengthPresentationFixture();
    wrongAuthority.workoutLinks[0].contentAuthority = { trainingContent: "healthkit", telemetry: "healthkit" };
    expect(projectConfirmedHealthKitWorkoutAttachments(wrongAuthority)).toEqual([]);

    const untrustedLogger = createSep23StrengthPresentationFixture();
    const session = untrustedLogger.canonicalEvidenceObjects
      .find((record) => record.canonicalId === untrustedLogger.ids.session);
    session.payload.metadata.logger_mode = "imported";
    expect(projectConfirmedHealthKitWorkoutAttachments(untrustedLogger)).toEqual([]);

    const brokenWorkoutProvenance = createSep23StrengthPresentationFixture();
    brokenWorkoutProvenance.canonicalWorkouts[0].provenance.currentSourceObservationId = "other-observation";
    expect(projectConfirmedHealthKitWorkoutAttachments(brokenWorkoutProvenance)).toEqual([]);

    const mismatchedLoggerIdentity = createSep23StrengthPresentationFixture();
    mismatchedLoggerIdentity.canonicalEvidenceObjects.find((record) => record.canonicalId === mismatchedLoggerIdentity.ids.session)
      .payload.id = "other-session";
    expect(projectConfirmedHealthKitWorkoutAttachments(mismatchedLoggerIdentity)).toEqual([]);
  });

  it("attributes confirmed HealthKit energy without adding it to the daily total", () => {
    const fixture = createSep23StrengthPresentationFixture({ dailyActiveCalories: 606, workoutActiveCalories: 410 });
    const report = createProviderActivityEvidenceReport(fixture);
    const day = report.latestActivityDay;

    expect(day).toMatchObject({
      activeCalories: 606,
      workoutActiveCalories: 410,
      nonWorkoutActiveCalories: 196,
      linkedTrainingSessionCount: 1,
      workoutEnergyAttribution: {
        policy: "workout_energy_is_descriptive_never_additive",
        confirmedHealthKitWorkoutCount: 1,
      },
      energyAnomaly: null,
    });
    expect(report.activityAreas.find((item) => item.id === "workout-activity")?.value).toBe("410 cal");
    expect(report.activityAreas.find((item) => item.id === "non-workout-activity")?.value).toBe("196 cal");
    expect(report.linkedTrainingContext).toEqual([expect.objectContaining({
      id: fixture.ids.session,
      value: "410 active cal",
      sourceEvidence: ["Workout Logger", "Apple Health"],
    })]);
  });

  it("floors an impossible non-workout remainder at zero and reports the anomaly", () => {
    const fixture = createSep23StrengthPresentationFixture({ dailyActiveCalories: 300, workoutActiveCalories: 410 });
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.nonWorkoutActiveCalories).toBe(0);
    expect(day.energyAnomaly).toEqual({
      code: "WORKOUT_ENERGY_EXCEEDS_DAILY_ACTIVE_ENERGY",
      dailyActiveCalories: 300,
      workoutActiveCalories: 410,
      provisional: false,
    });
  });

  it("aggregates multiple confirmed workouts once each with deterministic one-to-one identities", () => {
    const fixture = createSep23StrengthPresentationFixture({ dailyActiveCalories: 800, workoutActiveCalories: 410 });
    const secondSessionId = `${fixture.ids.session}-second`;
    const secondWorkoutId = `healthkit_canonical_workout_${"a".repeat(40)}`;
    const secondLinkId = getHealthKitWorkoutLinkRecordId(secondWorkoutId, secondSessionId);
    const logger = structuredClone(fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session));
    logger.canonicalId = secondSessionId;
    logger.payload.id = secondSessionId.replace(
      "training|authoritative|training_logger_draft_",
      "training_logger_session_",
    );
    logger.payload.metadata.start_time = "2026-09-23T12:00:00-07:00";
    fixture.canonicalEvidenceObjects.push(logger);
    const workout = structuredClone(fixture.canonicalWorkouts[0]);
    workout.id = secondWorkoutId;
    workout.current.startedAt = "2026-09-23T19:00:00.000Z";
    workout.current.endedAt = "2026-09-23T19:30:00.000Z";
    workout.current.telemetry.activeCalories = 125;
    fixture.canonicalWorkouts.push(workout);
    const link = structuredClone(fixture.workoutLinks[0]);
    link.id = secondLinkId;
    link.canonicalWorkoutId = secondWorkoutId;
    link.loggerSessionCanonicalId = secondSessionId;
    link.statusHistory = link.statusHistory.map((entry) => ({ ...entry }));
    fixture.workoutLinks.push(link);
    const claim = (kind, subject) => ({
      ...structuredClone(fixture.workoutLinkClaims[0]),
      id: getHealthKitWorkoutLinkClaimId(kind, subject),
      kind,
      holderLinkId: secondLinkId,
      history: [{ status: "held", holderLinkId: secondLinkId, at: link.updatedAt }],
    });
    fixture.workoutLinkClaims.push(claim("workout", secondWorkoutId), claim("session", secondSessionId));

    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.workoutActiveCalories).toBe(535);
    expect(day.nonWorkoutActiveCalories).toBe(265);
    expect(day.workoutEnergyAttribution.confirmedHealthKitWorkoutCount).toBe(2);
  });

  it("keeps missing workout energy missing and never invents zero calories", () => {
    const fixture = createSep23StrengthPresentationFixture({ workoutActiveCalories: null });
    fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session)
      .payload.metadata.active_calories = 999;
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.workoutActiveCalories).toBeNull();
    expect(day.nonWorkoutActiveCalories).toBeNull();
    expect(day.energyAnomaly).toBeNull();
  });

  it("keeps multi-workout attribution unknown when any confirmed workout energy is missing", () => {
    const fixture = createSep23StrengthPresentationFixture({ dailyActiveCalories: 800, workoutActiveCalories: 410 });
    const secondSessionId = `${fixture.ids.session}-missing-energy`;
    const secondWorkoutId = `healthkit_canonical_workout_${"b".repeat(40)}`;
    const secondLinkId = getHealthKitWorkoutLinkRecordId(secondWorkoutId, secondSessionId);
    const logger = structuredClone(fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session));
    logger.canonicalId = secondSessionId;
    logger.payload.id = secondSessionId.replace(
      "training|authoritative|training_logger_draft_",
      "training_logger_session_",
    );
    logger.payload.metadata.start_time = "2026-09-23T12:00:00-07:00";
    fixture.canonicalEvidenceObjects.push(logger);
    const workout = structuredClone(fixture.canonicalWorkouts[0]);
    workout.id = secondWorkoutId;
    workout.current.startedAt = "2026-09-23T19:00:00.000Z";
    workout.current.endedAt = "2026-09-23T19:30:00.000Z";
    workout.current.telemetry.activeCalories = null;
    fixture.canonicalWorkouts.push(workout);
    const link = structuredClone(fixture.workoutLinks[0]);
    link.id = secondLinkId;
    link.canonicalWorkoutId = secondWorkoutId;
    link.loggerSessionCanonicalId = secondSessionId;
    fixture.workoutLinks.push(link);
    const claim = (kind, subject) => ({
      ...structuredClone(fixture.workoutLinkClaims[0]),
      id: getHealthKitWorkoutLinkClaimId(kind, subject),
      kind,
      holderLinkId: secondLinkId,
      history: [{ status: "held", holderLinkId: secondLinkId, at: link.updatedAt }],
    });
    fixture.workoutLinkClaims.push(claim("workout", secondWorkoutId), claim("session", secondSessionId));

    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.workoutActiveCalories).toBeNull();
    expect(day.nonWorkoutActiveCalories).toBeNull();
    expect(day.energyAnomaly).toBeNull();
  });

  it("keeps non-workout energy unknown when the whole-day Activity total is missing", () => {
    const fixture = createSep23StrengthPresentationFixture({ dailyActiveCalories: null, workoutActiveCalories: 410 });
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.activeCalories).toBeNull();
    expect(day.workoutActiveCalories).toBe(410);
    expect(day.nonWorkoutActiveCalories).toBeNull();
    expect(day.energyAnomaly).toBeNull();
  });

  // Logged Today provenance: Apple Health is a caption under the whole
  // Training group (`row.context`), never a suffix on a line or the summary.
  const provenanceRuntime = (fixture) => ({
    canonicalEvidenceObjects: fixture.canonicalEvidenceObjects,
    healthKitCanonicalWorkouts: fixture.canonicalWorkouts,
    healthKitWorkoutLinks: fixture.workoutLinks,
    healthKitWorkoutLinkClaims: fixture.workoutLinkClaims,
  });
  const demoteLinkToCandidate = (fixture) => {
    fixture.workoutLinks[0].status = "candidate";
    fixture.workoutLinks[0].statusHistory = [fixture.workoutLinks[0].statusHistory[0]];
    fixture.workoutLinks[0].updatedAt = fixture.workoutLinks[0].createdAt;
    fixture.workoutLinkClaims = [];
  };

  it("adds Apple Health to the typed Strength line sources only after exact confirmation", () => {
    const LOGGER = { kind: "physiqueos_logger", label: "PhysiqueOS Logger" };
    const APPLE = { kind: "apple_health", label: "Apple Health" };
    const logFor = (fixture) => {
      const lines = [
        { id: "training:logger", kind: "logger", summary: "Strength Training · 50 min", href: "/x", recordId: fixture.ids.session,
          provenance: { scope: "Strength Training", sources: [LOGGER] } },
        { id: "training:cardio:outdoor-walk", kind: "cardio", summary: "2 Outdoor Walks · 32 min", href: "/progress/training", recordId: null,
          provenance: { scope: "2 Outdoor Walks", sources: [APPLE] } },
      ];
      return { localDate: fixture.day, loggedToday: { dateKey: fixture.day, rows: [
        { id: "training", summary: "Strength Training · 50 min, 2 Outdoor Walks · 32 min", context: null, contextDetail: null,
          provenance: null, recordId: null, lines },
      ] }, pendingEvidenceReviews: [] };
    };
    const confirmed = createSep23StrengthPresentationFixture();
    const row = projectConfirmedHealthKitLogProvenance(logFor(confirmed), provenanceRuntime(confirmed)).loggedToday.rows[0];
    expect(row.lines.map((line) => line.provenance.sources)).toEqual([[LOGGER, APPLE], [APPLE]]);
    expect(row.lines.map((line) => line.summary)).toEqual(["Strength Training · 50 min", "2 Outdoor Walks · 32 min"]);
    expect(row.contextDetail).toBeNull();

    const candidate = createSep23StrengthPresentationFixture();
    demoteLinkToCandidate(candidate);
    const log = logFor(candidate);
    const untouched = projectConfirmedHealthKitLogProvenance(log, provenanceRuntime(candidate)).loggedToday.rows[0];
    expect(untouched).toEqual(log.loggedToday.rows[0]);
    expect(untouched.lines[0].provenance.sources).toEqual([LOGGER]);
  });

  it("captions the Log Training group with Apple Health only after exact confirmation, without a duplicate row", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const log = {
      localDate: fixture.day,
      loggedToday: { rows: [
        { id: "training", summary: "Strength Training logged", context: null, recordId: fixture.ids.session },
        { id: "nutrition", summary: "2,100 calories", context: "Apple Health", recordId: "nutrition" },
        { id: "activity", summary: "606 active calories", context: "Apple Health", recordId: "activity" },
      ] },
      pendingEvidenceReviews: [],
    };
    const projected = projectConfirmedHealthKitLogProvenance(log, provenanceRuntime(fixture));
    expect(projected.loggedToday.rows).toHaveLength(3);
    expect(projected.loggedToday.rows[0].summary).toBe("Strength Training logged");
    expect(projected.loggedToday.rows[0].context).toBe("Apple Health");
    expect(projected.loggedToday.rows.slice(1)).toEqual(log.loggedToday.rows.slice(1));

    demoteLinkToCandidate(fixture);
    const unconfirmed = projectConfirmedHealthKitLogProvenance(log, provenanceRuntime(fixture));
    expect(unconfirmed.loggedToday.rows[0]).toEqual(log.loggedToday.rows[0]);
    expect(unconfirmed.loggedToday.rows[0].summary).toBe("Strength Training logged");
    expect(unconfirmed.loggedToday.rows[0].context).toBeNull();
  });

  it("captions a confirmed Strength + Cardio group once, leaving every line and the summary unsuffixed", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const lines = [
      { id: "training:logger", kind: "logger", summary: "Strength Training · 50 min", href: "/x", recordId: fixture.ids.session },
      { id: "training:cardio:outdoor-walk", kind: "cardio", summary: "2 Outdoor Walks · 32 min", href: "/progress/training", recordId: null },
    ];
    const log = { localDate: fixture.day, loggedToday: { dateKey: fixture.day, rows: [
      { id: "training", summary: "Strength Training · 50 min, 2 Outdoor Walks · 32 min", context: null, recordId: null, lines },
    ] }, pendingEvidenceReviews: [] };
    const runtime = provenanceRuntime(fixture);
    const row = projectConfirmedHealthKitLogProvenance(log, runtime).loggedToday.rows[0];
    expect(row.lines.map((line) => line.summary)).toEqual(["Strength Training · 50 min", "2 Outdoor Walks · 32 min"]);
    expect(row.lines).toEqual(lines);
    expect(row.summary).toBe("Strength Training · 50 min, 2 Outdoor Walks · 32 min");
    expect(row.context).toBe("Apple Health");
    // Idempotent: projecting again changes nothing and never doubles the caption.
    const again = projectConfirmedHealthKitLogProvenance({ ...log, loggedToday: { ...log.loggedToday, rows: [row] } }, runtime);
    expect(again.loggedToday.rows[0]).toEqual(row);
    expect(again.loggedToday.rows[0].context).toBe("Apple Health");
  });

  it("leaves a Strength + Cardio group untouched while the Strength link is unconfirmed", () => {
    // Deliberate product decision: a caption under the group would claim the
    // unconfirmed Strength line, so the Cardio lines' provenance stays silent.
    const fixture = createSep23StrengthPresentationFixture();
    demoteLinkToCandidate(fixture);
    const lines = [
      { id: "training:logger", kind: "logger", summary: "Strength Training · 50 min", href: "/x", recordId: fixture.ids.session },
      { id: "training:cardio:outdoor-walk", kind: "cardio", summary: "2 Outdoor Walks · 32 min", href: "/progress/training", recordId: null },
    ];
    const log = { localDate: fixture.day, loggedToday: { dateKey: fixture.day, rows: [
      { id: "training", summary: "Strength Training · 50 min, 2 Outdoor Walks · 32 min", context: null, recordId: null, lines },
    ] }, pendingEvidenceReviews: [] };
    const row = projectConfirmedHealthKitLogProvenance(log, provenanceRuntime(fixture)).loggedToday.rows[0];
    expect(row).toEqual(log.loggedToday.rows[0]);
    expect(row.context).toBeNull();
    expect(row.lines.map((line) => line.summary)).toEqual(["Strength Training · 50 min", "2 Outdoor Walks · 32 min"]);
  });

  it("joins Apple Health onto an existing Strength context caption", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const lines = [
      { id: "training:logger", kind: "logger", summary: "Strength Training · 50 min", href: "/x", recordId: fixture.ids.session },
    ];
    const log = { localDate: fixture.day, loggedToday: { dateKey: fixture.day, rows: [
      { id: "training", summary: "Strength Training · 50 min", context: "Movements not added", recordId: fixture.ids.session, lines },
    ] }, pendingEvidenceReviews: [] };
    const row = projectConfirmedHealthKitLogProvenance(log, provenanceRuntime(fixture)).loggedToday.rows[0];
    expect(row.summary).toBe("Strength Training · 50 min");
    expect(row.lines).toEqual(lines);
    expect(row.context).toBe("Movements not added · Apple Health");
  });

  it("keeps a Cardio-only row the domain already captioned unchanged", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const lines = [
      { id: "training:cardio:outdoor-walk", kind: "cardio", summary: "2 Outdoor Walks · 32 min", href: "/progress/training", recordId: null },
    ];
    const log = { localDate: fixture.day, loggedToday: { dateKey: fixture.day, rows: [
      { id: "training", summary: "2 Outdoor Walks · 32 min", context: "Apple Health", href: "/progress/training", recordId: null, lines },
    ] }, pendingEvidenceReviews: [] };
    const row = projectConfirmedHealthKitLogProvenance(log, provenanceRuntime(fixture)).loggedToday.rows[0];
    expect(row).toEqual(log.loggedToday.rows[0]);
    expect(row.context).toBe("Apple Health");
  });

  it("captions an aggregate legacy Log row with multiple Training sessions without touching its summary", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const second = structuredClone(fixture.canonicalEvidenceObjects
      .find((record) => record.canonicalId === fixture.ids.session));
    second.canonicalId = `${fixture.ids.session}-walk`;
    second.payload.id = second.canonicalId.replace(
      "training|authoritative|training_logger_draft_",
      "training_logger_session_",
    );
    second.payload.metadata.activity_type = "Walking";
    fixture.canonicalEvidenceObjects.push(second);
    const log = {
      localDate: fixture.day,
      loggedToday: {
        dateKey: fixture.day,
        rows: [{
          id: "training", label: "Training", summary: "Strength Training · Walking",
          context: null, href: "/progress/training", recordId: null,
        }],
      },
      pendingEvidenceReviews: [],
    };

    const projected = projectConfirmedHealthKitLogProvenance(log, provenanceRuntime(fixture));

    expect(projected.loggedToday.rows).toHaveLength(1);
    expect(projected.loggedToday.rows[0].summary).toBe("Strength Training · Walking");
    expect(projected.loggedToday.rows[0].context).toBe("Apple Health");
  });

  it("attaches Apple telemetry to the one Logger-owned Workout Detail projection", async () => {
    const fixture = createSep23StrengthPresentationFixture();
    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    const exercisesBefore = structuredClone(logger.payload.exercises);
    const service = createTrainingNavigationReadService({
      readCanonicalExerciseRegistry: async () => [],
      store: {
        run: (_name, callback) => callback(),
        getCanonicalEvidenceObject: async (id) => id === fixture.ids.session ? logger : null,
        listHealthKitCanonicalWorkouts: async () => fixture.canonicalWorkouts,
        listHealthKitWorkoutLinks: async () => fixture.workoutLinks,
        listHealthKitWorkoutLinkClaims: async () => fixture.workoutLinkClaims,
      },
    });
    const session = await service.getSession({ sessionId: fixture.ids.session });
    expect(session.id).toBe(fixture.ids.session);
    expect(session.exercises).toEqual(exercisesBefore);
    expect(session.healthKitAttachment).toMatchObject({
      relationship: { status: "confirmed" },
      source: { application: "Apple Health", sourceName: "Apple Watch" },
      session: { startedAt: "2026-09-23T17:01:00.000Z", durationSeconds: null, activeCalories: 410 },
    });
    expect(session.sourceEvidence).toEqual(["Workout Logger", "Apple Health"]);
    expect(logger.payload.exercises).toEqual(exercisesBefore);
  });
});

describe("Logger presentation changes only for a CONFIRMED link (2026-10-04 correction)", () => {
  function workoutDetailService(fixture, logger) {
    return createTrainingNavigationReadService({
      readCanonicalExerciseRegistry: async () => [],
      store: {
        run: (_name, callback) => callback(),
        getCanonicalEvidenceObject: async (id) => id === logger.canonicalId ? logger : null,
        listHealthKitCanonicalWorkouts: async () => fixture.canonicalWorkouts,
        listHealthKitWorkoutLinks: async () => fixture.workoutLinks,
        listHealthKitWorkoutLinkClaims: async () => fixture.workoutLinkClaims,
      },
    });
  }

  function snapshot(fixture) {
    return structuredClone({
      canonicalEvidenceObjects: fixture.canonicalEvidenceObjects,
      canonicalWorkouts: fixture.canonicalWorkouts,
      workoutLinks: fixture.workoutLinks,
      workoutLinkClaims: fixture.workoutLinkClaims,
    });
  }

  function asUnconfirmed(fixture, status) {
    const link = fixture.workoutLinks[0];
    link.status = status;
    link.statusHistory = [link.statusHistory[0], ...(status === "unlinked"
      ? [{ status: "unlinked", at: link.updatedAt, by: { kind: "founder", ref: "no_match" } }]
      : [])];
    if (status === "candidate") link.updatedAt = link.createdAt;
    fixture.workoutLinkClaims = [];
    return fixture;
  }

  it("a possible_match with no link row leaves the Logger's own timing on every presentation surface", async () => {
    const fixture = createSep24StrengthPresentationFixture();
    const before = snapshot(fixture);
    const strengthWorkout = fixture.canonicalWorkouts.find((workout) => workout.id === fixture.ids.strengthWorkout);

    // The matcher still finds the pair (reviews are unaffected) ...
    const assessment = assessHealthKitStrengthLinkCandidates({
      canonicalWorkout: strengthWorkout,
      canonicalObjects: fixture.canonicalEvidenceObjects,
      existingLinks: fixture.workoutLinks,
      canonicalWorkouts: fixture.canonicalWorkouts,
    });
    expect(assessment.outcome).toBe(HealthKitStrengthMatchOutcome.POSSIBLE);
    expect(assessment.candidates[0]).toMatchObject({ confidence: 60, loggerSessionCanonicalId: fixture.ids.session });

    // ... but nothing unconfirmed changes how the Logger session is presented.
    expect(projectHealthKitStrengthWorkoutPresentationBySession(fixture).has(fixture.ids.session)).toBe(false);

    const report = createProviderActivityEvidenceReport(fixture);
    const entry = report.linkedTrainingContext.find((item) => item.id === fixture.ids.session);
    expect(entry.healthKitPresentation).toBeUndefined();
    expect(entry.sourceEvidence).not.toContain("Apple Health");
    expect(entry.detail).toContain("2026-09-24T11:22:10-07:00 · 1h 34m");
    expect(entry.detail).not.toContain("28 min");
    expect(report.latestActivityDay.workoutEnergyAttribution.confirmedHealthKitWorkoutCount).toBe(0);

    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    const session = await workoutDetailService(fixture, logger).getSession({ sessionId: fixture.ids.session });
    expect(session.healthKitAttachment).toBeUndefined();
    expect(session.exercises).toEqual(before.canonicalEvidenceObjects
      .find((record) => record.canonicalId === fixture.ids.session).payload.exercises);
    expect(session.telemetry?.startTime).not.toBe("2026-09-24T18:22:10.000Z");
    expect(session.telemetry?.durationSeconds).not.toBe(1679);

    expect(snapshot(fixture)).toEqual(before);
  });

  it("a pending candidate link row (awaiting the Founder) never changes the Logger presentation", async () => {
    const fixture = asUnconfirmed(createSep23StrengthPresentationFixture(), "candidate");
    const before = snapshot(fixture);
    expect(projectHealthKitStrengthWorkoutPresentationBySession(fixture).size).toBe(0);
    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    const session = await workoutDetailService(fixture, logger).getSession({ sessionId: fixture.ids.session });
    expect(session.healthKitAttachment).toBeUndefined();
    expect(session.telemetry?.startTime).not.toBe("2026-09-23T17:00:00.000Z");
    const entry = createProviderActivityEvidenceReport(fixture).linkedTrainingContext
      .find((item) => item.id === fixture.ids.session);
    expect(entry.healthKitPresentation).toBeUndefined();
    expect(snapshot(fixture)).toEqual(before);
  });

  it("a Founder No match (unlinked) never changes the Logger presentation", async () => {
    const fixture = asUnconfirmed(createSep23StrengthPresentationFixture(), "unlinked");
    const before = snapshot(fixture);
    expect(projectHealthKitStrengthWorkoutPresentationBySession(fixture).size).toBe(0);
    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    const session = await workoutDetailService(fixture, logger).getSession({ sessionId: fixture.ids.session });
    expect(session.healthKitAttachment).toBeUndefined();
    const entry = createProviderActivityEvidenceReport(fixture).linkedTrainingContext
      .find((item) => item.id === fixture.ids.session);
    expect(entry.healthKitPresentation).toBeUndefined();
    expect(entry.sourceEvidence).not.toContain("Apple Health");
    expect(snapshot(fixture)).toEqual(before);
  });

  it("no Apple workout at all keeps the Logger's own timing", () => {
    const fixture = createSep24StrengthPresentationFixture();
    fixture.canonicalWorkouts = [];
    expect(projectHealthKitStrengthWorkoutPresentationBySession(fixture).has(fixture.ids.session)).toBe(false);
  });

  it("never presents a non-Strength workout (Indoor Walk) on a Strength Logger session", () => {
    const fixture = createSep24StrengthPresentationFixture();
    fixture.canonicalWorkouts = fixture.canonicalWorkouts.filter((workout) => workout.id !== fixture.ids.strengthWorkout);
    expect(projectHealthKitStrengthWorkoutPresentationBySession(fixture).has(fixture.ids.session)).toBe(false);
  });

  it("a confirmed link is exactly the confirmed-only projection, with confirmed telemetry intact", async () => {
    const fixture = createSep23StrengthPresentationFixture();
    const before = snapshot(fixture);
    const confirmedOnly = projectConfirmedHealthKitWorkoutAttachments(fixture);
    const presentation = projectHealthKitStrengthWorkoutPresentationBySession(fixture);
    expect([...presentation.values()]).toEqual(confirmedOnly);
    expect(presentation.get(fixture.ids.session).relationship.status).toBe("confirmed");

    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    const session = await workoutDetailService(fixture, logger).getSession({ sessionId: fixture.ids.session });
    expect(session.healthKitAttachment).toMatchObject({
      relationship: { status: "confirmed" },
      // Option A: confirmed Apple telemetry (energy/HR), Logger-owned window.
      session: { startedAt: "2026-09-23T17:01:00.000Z", activeCalories: 410, averageHeartRate: 122 },
    });
    expect(session.telemetry).toMatchObject({ startTime: "2026-09-23T17:01:00.000Z", activeCalories: 410, averageHeartRate: 122 });
    expect(session.telemetry.startTime).not.toBe("2026-09-23T17:00:00.000Z");
    expect(session.telemetry.durationSeconds).not.toBe(3600);
    expect(session.exercises).toEqual(logger.payload.exercises);
    expect(snapshot(fixture)).toEqual(before);
  });
});

describe("Option A: a confirmed Strength link keeps the Logger window (2026-10-05)", () => {
  // Today's shape: Logger 12:31-1:47 PM (76 min) vs a hand-started Apple
  // Traditional Strength workout 1:28-1:48 PM (20 min), then confirmed.
  function confirmedFixture({ appleStart, appleEnd, appleSeconds }) {
    const fixture = createSep23StrengthPresentationFixture();
    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    Object.assign(logger.payload.metadata, {
      start_time: "2026-09-23T12:31:00-07:00",
      end_time: "2026-09-23T13:47:00-07:00",
      duration_seconds: 4560,
    });
    const workout = fixture.canonicalWorkouts.find((item) => item.id === fixture.ids.workout);
    workout.current.startedAt = appleStart;
    workout.current.endedAt = appleEnd;
    workout.current.telemetry.durationSeconds = appleSeconds;
    return { fixture, logger };
  }

  async function workoutDetail(fixture, logger) {
    return createTrainingNavigationReadService({
      readCanonicalExerciseRegistry: async () => [],
      store: {
        run: (_name, callback) => callback(),
        getCanonicalEvidenceObject: async (id) => id === logger.canonicalId ? logger : null,
        listHealthKitCanonicalWorkouts: async () => fixture.canonicalWorkouts,
        listHealthKitWorkoutLinks: async () => fixture.workoutLinks,
        listHealthKitWorkoutLinkClaims: async () => fixture.workoutLinkClaims,
      },
    }).getSession({ sessionId: logger.canonicalId });
  }

  for (const [label, apple] of [
    ["full-window", { appleStart: "2026-09-23T19:31:00.000Z", appleEnd: "2026-09-23T20:47:00.000Z", appleSeconds: 4560 }],
    ["late/truncated", { appleStart: "2026-09-23T20:28:00.000Z", appleEnd: "2026-09-23T20:48:00.000Z", appleSeconds: 1200 }],
  ]) {
    it(`a ${label} confirmed Apple workout keeps the Logger window on every surface, with Apple energy/HR`, async () => {
      const { fixture, logger } = confirmedFixture(apple);
      const exercisesBefore = structuredClone(logger.payload.exercises);
      const before = structuredClone({
        canonicalEvidenceObjects: fixture.canonicalEvidenceObjects,
        canonicalWorkouts: fixture.canonicalWorkouts,
        workoutLinks: fixture.workoutLinks,
        workoutLinkClaims: fixture.workoutLinkClaims,
      });
      const loggerWindow = {
        startedAt: "2026-09-23T19:31:00.000Z",
        endedAt: "2026-09-23T20:47:00.000Z",
        durationSeconds: 4560,
      };

      // Shared projection.
      const attachment = projectHealthKitStrengthWorkoutPresentationBySession(fixture).get(fixture.ids.session);
      expect(attachment).toMatchObject({
        relationship: { status: "confirmed", contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" } },
        source: { application: "Apple Health" },
        session: { ...loggerWindow, activeCalories: 410, averageHeartRate: 122 },
      });

      // Workout Detail.
      const detail = await workoutDetail(fixture, logger);
      expect(detail.healthKitAttachment.session).toMatchObject(loggerWindow);
      expect(detail.telemetry).toMatchObject({
        startTime: loggerWindow.startedAt, endTime: loggerWindow.endedAt, durationSeconds: 4560,
        activeCalories: 410, averageHeartRate: 122,
      });
      expect(detail.exercises).toEqual(exercisesBefore);
      if (apple.appleStart !== loggerWindow.startedAt) expect(JSON.stringify(detail)).not.toContain(apple.appleStart);

      // Training Day / Activity linked-training context, and accounting.
      const report = createProviderActivityEvidenceReport(fixture);
      const entry = report.linkedTrainingContext.find((item) => item.id === fixture.ids.session);
      expect(entry).toMatchObject({
        value: "410 active cal",
        sourceEvidence: ["Workout Logger", "Apple Health"],
        healthKitPresentation: { status: "confirmed" },
      });
      expect(entry.detail).toContain(`${loggerWindow.startedAt}-${loggerWindow.endedAt}`);
      expect(entry.detail).toContain("1h 16m");
      if (apple.appleStart !== loggerWindow.startedAt) expect(entry.detail).not.toContain(apple.appleStart);
      const day = report.latestActivityDay;
      expect(day.workoutEnergyAttribution.confirmedHealthKitWorkoutCount).toBe(1);

      // Logged Today.
      const loggedToday = composeLoggedTodaySummary({
        canonicalObjects: fixture.canonicalEvidenceObjects,
        dateKey: "2026-09-23",
        healthKitStrengthPresentationBySession: projectHealthKitStrengthWorkoutPresentationBySession(fixture),
      });
      expect(loggedToday.rows[0].lines[0]).toMatchObject({ kind: "logger", summary: "Strength Training · 76 min" });

      // Nothing was written; one Logger-owned session, no duplicate.
      expect({
        canonicalEvidenceObjects: fixture.canonicalEvidenceObjects,
        canonicalWorkouts: fixture.canonicalWorkouts,
        workoutLinks: fixture.workoutLinks,
        workoutLinkClaims: fixture.workoutLinkClaims,
      }).toEqual(before);
      expect(fixture.canonicalEvidenceObjects.filter((record) => (record.payload ?? record).evidence_type === "training")).toHaveLength(1);
    });
  }

  it("never fills a missing Logger end or duration from the Apple workout", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const attachment = projectHealthKitStrengthWorkoutPresentationBySession(fixture).get(fixture.ids.session);
    expect(attachment.session).toMatchObject({ startedAt: "2026-09-23T17:01:00.000Z", endedAt: null, durationSeconds: null });
  });

  it("derives the Logger end from its own start + duration when only those are stored", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    logger.payload.metadata.duration_seconds = 4560;
    const attachment = projectHealthKitStrengthWorkoutPresentationBySession(fixture).get(fixture.ids.session);
    expect(attachment.session).toMatchObject({
      startedAt: "2026-09-23T17:01:00.000Z", endedAt: "2026-09-23T18:17:00.000Z", durationSeconds: 4560,
    });
  });
});

describe("Part E: whole-day HealthKit workout-calorie attribution", () => {
  it("projects an eligible Cardio workout without any confirmed link, and a confirmed Strength workout, each tagged with its own eligibility basis", () => {
    const strength = createSep23StrengthPresentationFixture();
    const cardio = createCardioWholeDayAttributionFixture();
    const combined = {
      canonicalEvidenceObjects: strength.canonicalEvidenceObjects,
      canonicalWorkouts: [...strength.canonicalWorkouts, ...cardio.canonicalWorkouts],
      workoutLinks: strength.workoutLinks,
      workoutLinkClaims: strength.workoutLinkClaims,
    };
    const eligible = projectWholeDayEligibleHealthKitWorkouts(combined);
    expect(eligible).toHaveLength(2);
    expect(eligible.find((entry) => entry.family === "strength")).toMatchObject({
      canonicalWorkoutId: strength.ids.workout,
      eligibility: { basis: "confirmed_strength_link", includedInWholeDayEnergy: true },
      session: { activeCalories: 410 },
    });
    expect(eligible.find((entry) => entry.family === "cardio")).toMatchObject({
      canonicalWorkoutId: cardio.ids.cardioWorkout,
      eligibility: { basis: "canonicalized_cardio", includedInWholeDayEnergy: true },
      session: { activeCalories: 300 },
    });
  });

  it("never treats an unconfirmed candidate Strength workout as whole-day-eligible, unlike Cardio which needs no confirmation", () => {
    const fixture = createSep24StrengthPresentationFixture();
    // No confirmed link exists in this fixture at all (audited "no_match").
    const eligible = projectWholeDayEligibleHealthKitWorkouts(fixture);
    expect(eligible.every((entry) => entry.family !== "strength")).toBe(true);
    expect(eligible.map((entry) => entry.canonicalWorkoutId).sort()).toEqual(
      [fixture.ids.walkBefore, fixture.ids.walkAfter].sort()
    );
  });

  it("groups eligible workouts by their own canonical localDate for the day the accounting engine needs, not any Logger session's date", () => {
    const cardio = createCardioWholeDayAttributionFixture({ day: "2026-09-25" });
    const byDate = indexWholeDayEligibleHealthKitWorkoutsByDate(cardio);
    expect([...byDate.keys()]).toEqual(["2026-09-25"]);
    expect(byDate.get("2026-09-25")).toHaveLength(1);
  });

  it("keeps the Sep 23 confirmed-Strength case byte-identical, now sourced through the canonical-workout-identity path instead of the Logger-session path", () => {
    const fixture = createSep23StrengthPresentationFixture({ dailyActiveCalories: 606, workoutActiveCalories: 410 });
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;

    // Byte-identical to the pre-Part-E numbers this file already pinned above.
    expect(day.activeCalories).toBe(606);
    expect(day.workoutActiveCalories).toBe(410);
    expect(day.nonWorkoutActiveCalories).toBe(196);
    expect(day.workoutEnergyAttribution.confirmedHealthKitWorkoutCount).toBe(1);
    expect(day.workoutEnergyAttribution.eligibleHealthKitWorkoutCount).toBe(1);
    expect(day.workoutEnergyAttribution.workoutEnergyDataIncomplete).toBe(false);

    // The "different path": one contributing workout, resolved by canonical
    // workout identity (confirmed link), not by re-deriving from the Logger
    // session's own metadata.
    expect(day.contributingWorkouts).toHaveLength(1);
    expect(day.contributingWorkouts[0]).toMatchObject({
      id: fixture.ids.workout,
      family: "strength",
      activeCalories: 410,
      provenance: { basis: "confirmed_strength_link" },
    });
  });

  it("adds a canonicalized Cardio workout's energy to Activity without ever recomputing the whole-day HealthKit total, and removes it symmetrically from non-workout energy", () => {
    const before = createCardioWholeDayAttributionFixture({ dailyActiveCalories: 900, cardioActiveCalories: 300 });
    before.canonicalWorkouts = []; // Not canonicalized yet.
    const dayBefore = createProviderActivityEvidenceReport(before).latestActivityDay;
    expect(dayBefore.activeCalories).toBe(900);
    expect(dayBefore.workoutActiveCalories).toBe(0);
    expect(dayBefore.nonWorkoutActiveCalories).toBe(900);

    const after = createCardioWholeDayAttributionFixture({ dailyActiveCalories: 900, cardioActiveCalories: 300 });
    const dayAfter = createProviderActivityEvidenceReport(after).latestActivityDay;

    // The daily HealthKit aggregate itself never moves: canonicalizing a
    // workout only reshuffles ITS OWN breakdown, never the whole-day figure.
    expect(dayAfter.activeCalories).toBe(900);
    expect(dayAfter.workoutActiveCalories).toBe(300);
    expect(dayAfter.nonWorkoutActiveCalories).toBe(600);
    expect(dayAfter.activeCalories - dayBefore.activeCalories).toBe(0);
    expect(dayAfter.workoutActiveCalories - dayBefore.workoutActiveCalories).toBe(300);
    expect(dayBefore.nonWorkoutActiveCalories - dayAfter.nonWorkoutActiveCalories).toBe(300);

    expect(dayAfter.contributingWorkouts).toEqual([expect.objectContaining({
      id: after.ids.cardioWorkout,
      family: "cardio",
      canonicalType: "walking",
      activeCalories: 300,
      provenance: expect.objectContaining({ basis: "canonicalized_cardio" }),
    })]);
  });

  it("combines a confirmed canonical Strength workout and a canonicalized Cardio workout on the same day, each exactly once, with no double count even if a duplicate entry sneaks in", () => {
    const strength = createSep23StrengthPresentationFixture({ dailyActiveCalories: 900, workoutActiveCalories: 410 });
    const cardio = createCardioWholeDayAttributionFixture({ day: strength.day, cardioActiveCalories: 150 });
    const duplicateCardio = structuredClone(cardio.canonicalWorkouts[0]);
    const fixture = {
      canonicalEvidenceObjects: strength.canonicalEvidenceObjects,
      // Same cardio workout id appears twice -- defensive dedup must still
      // count its energy exactly once.
      canonicalWorkouts: [...strength.canonicalWorkouts, ...cardio.canonicalWorkouts, duplicateCardio],
      workoutLinks: strength.workoutLinks,
      workoutLinkClaims: strength.workoutLinkClaims,
    };
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;

    expect(day.workoutActiveCalories).toBe(560); // 410 (strength) + 150 (cardio), once each.
    expect(day.nonWorkoutActiveCalories).toBe(340); // 900 - 560
    expect(day.workoutEnergyAttribution.eligibleHealthKitWorkoutCount).toBe(2);
    expect(day.contributingWorkouts).toHaveLength(2);
    expect(new Set(day.contributingWorkouts.map((workout) => workout.id)).size).toBe(2);
  });

  it("clamps non-workout energy at zero, never negative, when eligible workout energy exceeds the daily total", () => {
    const fixture = createCardioWholeDayAttributionFixture({ dailyActiveCalories: 100, cardioActiveCalories: 300 });
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.workoutActiveCalories).toBe(300);
    expect(day.nonWorkoutActiveCalories).toBe(0);
    expect(day.energyAnomaly).toEqual({
      code: "WORKOUT_ENERGY_EXCEEDS_DAILY_ACTIVE_ENERGY",
      dailyActiveCalories: 100,
      provisional: false,
      workoutActiveCalories: 300,
    });
  });

  it("keeps whole-day workout energy explicitly unknown -- never a silent zero -- when an eligible Cardio workout's own energy has not arrived yet", () => {
    const fixture = createCardioWholeDayAttributionFixture({ dailyActiveCalories: 900, cardioActiveCalories: null });
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.workoutActiveCalories).toBeNull();
    expect(day.nonWorkoutActiveCalories).toBeNull();
    expect(day.workoutEnergyAttribution.workoutEnergyDataIncomplete).toBe(true);
    expect(day.workoutEnergyAttribution.eligibleHealthKitWorkoutCount).toBe(1);
    // The row is still visible on Activity Detail -- honestly showing no
    // energy -- rather than disappearing or reading zero.
    expect(day.contributingWorkouts).toEqual([expect.objectContaining({
      id: fixture.ids.cardioWorkout,
      activeCalories: null,
    })]);
  });

  it("never creates a Training Logger session, a HealthKit workout link, or a link claim for a canonicalized Cardio workout used in whole-day accounting", () => {
    const fixture = createCardioWholeDayAttributionFixture();
    const beforeEvidenceCount = fixture.canonicalEvidenceObjects.length;
    const beforeEvidence = structuredClone(fixture.canonicalEvidenceObjects);
    const beforeLinks = structuredClone(fixture.workoutLinks);
    const beforeClaims = structuredClone(fixture.workoutLinkClaims);

    const report = createProviderActivityEvidenceReport(fixture);

    // No Training Logger session for Cardio, before or after.
    expect(fixture.canonicalEvidenceObjects).toHaveLength(beforeEvidenceCount);
    expect(fixture.canonicalEvidenceObjects.filter((record) =>
      (record.payload ?? record).evidence_type === "training")).toHaveLength(0);
    // Nothing in the source evidence, links, or claims was mutated by
    // read-only whole-day accounting.
    expect(fixture.canonicalEvidenceObjects).toEqual(beforeEvidence);
    expect(fixture.workoutLinks).toEqual(beforeLinks);
    expect(fixture.workoutLinkClaims).toEqual(beforeClaims);
    expect(fixture.workoutLinks).toEqual([]);
    expect(fixture.workoutLinkClaims).toEqual([]);
    // The Log surface's Training row keys off `evidence_type === "training"`
    // Logger sessions only (see LoggedTodayService.js's composeTrainingRow);
    // with none created, Cardio never fabricates a Training row.
    expect(report.linkedTrainingContext).toEqual([]);
    expect(report.latestActivityDay.contributingWorkouts).toHaveLength(1);
  });

  it("exposes the specific indoor/outdoor canonical type on Activity Detail's contributingWorkouts, not merely the generic family or the unspecific type", () => {
    const fixture = createCardioWholeDayAttributionFixture({ canonicalType: "indoor_walking" });
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;

    expect(day.contributingWorkouts).toHaveLength(1);
    expect(day.contributingWorkouts[0]).toMatchObject({
      id: fixture.ids.cardioWorkout,
      family: "cardio",
      canonicalType: "indoor_walking",
    });
    // Never collapsed to the family or to the generic (unspecific) type.
    expect(day.contributingWorkouts[0].canonicalType).not.toBe("cardio");
    expect(day.contributingWorkouts[0].canonicalType).not.toBe("walking");
  });
});

describe("same-day Activity truthfulness (Sep 28)", () => {
  function partialDay(fixture) {
    fixture.canonicalEvidenceObjects[0].payload.metadata = { coverage: "partial_day" };
    return fixture;
  }
  // The fixture's day is "today" for the in-progress cases.
  const onFixtureDay = () => vi.useFakeTimers({ now: new Date("2026-09-25T20:00:00.000Z"), toFake: ["Date"] });
  afterEach(() => vi.useRealTimers());

  it("presents today's partial Apple Health day as 'so far' and its energy gap as provisional", () => {
    onFixtureDay();
    const fixture = partialDay(createCardioWholeDayAttributionFixture({ dailyActiveCalories: 171, cardioActiveCalories: 211 }));
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.isPartialDay).toBe(true);
    expect(day.coverage).toBe("partial_day");
    expect(day.value).toBe("171 active cal / 30 min so far");
    expect(day.energyAnomaly).toMatchObject({ code: "WORKOUT_ENERGY_EXCEEDS_DAILY_ACTIVE_ENERGY", provisional: true });
    // Workout energy stays descriptive: never added, and the remainder never negative.
    expect(day.nonWorkoutActiveCalories).toBe(0);
  });

  it("a PAST day left partial is marked a partial day, never 'so far' or provisional", () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T20:00:00.000Z"), toFake: ["Date"] });
    const fixture = partialDay(createCardioWholeDayAttributionFixture({ dailyActiveCalories: 171, cardioActiveCalories: 211 }));
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.isPartialDay).toBe(false);
    expect(day.coverageState).toBe("incomplete");
    expect(day.value).toBe("171 active cal / 30 min · partial day");
    expect(day.energyAnomaly.provisional).toBe(false);
  });

  it("counts a Cardio workout that duplicates an existing screenshot workout once, as Training Day does", () => {
    const fixture = createCardioWholeDayAttributionFixture();
    const walk = fixture.canonicalWorkouts[0];
    fixture.canonicalEvidenceObjects.push({
      canonicalId: "walk-screenshot", quality: { status: "active" },
      payload: { id: "walk-screenshot", evidence_type: "training", observed_at: fixture.day,
        metadata: { activity_type: "Outdoor Walk", duration_seconds: 1800 }, quality: { status: "active" } },
    });
    const withoutDuplicateDecision = createProviderActivityEvidenceReport(structuredClone(fixture)).latestActivityDay;
    walk.coexistence = { state: "matches_existing_evidence_workout", candidates: [{ canonicalId: "walk-screenshot" }] };
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.linkedWorkoutCount).toBe(1);
    // Control: two distinct workouts when no duplicate decision exists (live reassessment finds none here).
    expect(withoutDuplicateDecision.linkedWorkoutCount).toBe(2);
  });

  it("a complete day carries no 'so far' and a non-provisional anomaly", () => {
    const fixture = createCardioWholeDayAttributionFixture({ dailyActiveCalories: 100, cardioActiveCalories: 300 });
    fixture.canonicalEvidenceObjects[0].payload.metadata = { coverage: "complete_day" };
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.isPartialDay).toBe(false);
    expect(day.value).toBe("100 active cal / 30 min");
    expect(day.energyAnomaly.provisional).toBe(false);
  });

  it("an ordinary partial day with workout energy inside the total shows no anomaly", () => {
    onFixtureDay();
    const fixture = partialDay(createCardioWholeDayAttributionFixture({ dailyActiveCalories: 828, cardioActiveCalories: 211 }));
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.energyAnomaly).toBeNull();
    expect(day.nonWorkoutActiveCalories).toBe(617);
  });

  it("counts one Cardio-only day's workout as linked (was 0: only Logger sessions counted)", () => {
    const day = createProviderActivityEvidenceReport(createCardioWholeDayAttributionFixture()).latestActivityDay;
    expect(day.linkedWorkoutCount).toBe(1);
    expect(day.detail).toContain("1 workout linked");
  });
});
