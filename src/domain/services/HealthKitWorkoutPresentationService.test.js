import { describe, expect, it } from "vitest";
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
      session: { activeCalories: 410, durationSeconds: 3600, averageHeartRate: 122 },
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

  it("adds subtle Log provenance only after exact confirmation, without a duplicate row", () => {
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
    const projected = projectConfirmedHealthKitLogProvenance(log, {
      canonicalEvidenceObjects: fixture.canonicalEvidenceObjects,
      healthKitCanonicalWorkouts: fixture.canonicalWorkouts,
      healthKitWorkoutLinks: fixture.workoutLinks,
      healthKitWorkoutLinkClaims: fixture.workoutLinkClaims,
    });
    expect(projected.loggedToday.rows).toHaveLength(3);
    expect(projected.loggedToday.rows[0].summary).toBe("Strength Training · Apple Health");

    fixture.workoutLinks[0].status = "candidate";
    fixture.workoutLinks[0].statusHistory = [fixture.workoutLinks[0].statusHistory[0]];
    fixture.workoutLinks[0].updatedAt = fixture.workoutLinks[0].createdAt;
    fixture.workoutLinkClaims = [];
    const unconfirmed = projectConfirmedHealthKitLogProvenance(log, {
      canonicalEvidenceObjects: fixture.canonicalEvidenceObjects,
      healthKitCanonicalWorkouts: fixture.canonicalWorkouts,
      healthKitWorkoutLinks: fixture.workoutLinks,
      healthKitWorkoutLinkClaims: fixture.workoutLinkClaims,
    });
    expect(unconfirmed.loggedToday.rows[0].summary).toBe("Strength Training logged");
  });

  it("preserves HealthKit provenance on an aggregate Log row with multiple Training sessions", () => {
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

    const projected = projectConfirmedHealthKitLogProvenance(log, {
      canonicalEvidenceObjects: fixture.canonicalEvidenceObjects,
      healthKitCanonicalWorkouts: fixture.canonicalWorkouts,
      healthKitWorkoutLinks: fixture.workoutLinks,
      healthKitWorkoutLinkClaims: fixture.workoutLinkClaims,
    });

    expect(projected.loggedToday.rows).toHaveLength(1);
    expect(projected.loggedToday.rows[0].summary).toBe("Strength Training · Walking · Apple Health");
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
      session: { activeCalories: 410, durationSeconds: 3600 },
    });
    expect(session.sourceEvidence).toEqual(["Workout Logger", "Apple Health"]);
    expect(logger.payload.exercises).toEqual(exercisesBefore);
  });
});

describe("HK telemetry presentation for an unconfirmed Logger session (September 24)", () => {
  it("resolves the sole same-day Strength workout as an unconfirmed candidate, with real HK telemetry -- never the Logger's frozen 94-minute duration", () => {
    const fixture = createSep24StrengthPresentationFixture();
    const strengthWorkout = fixture.canonicalWorkouts.find((workout) => workout.id === fixture.ids.strengthWorkout);

    // The audited stored state: no confirmed (or even candidate) link record
    // exists yet for this pair.
    expect(fixture.workoutLinks).toEqual([]);
    expect(indexConfirmedHealthKitWorkoutAttachments(fixture).size).toBe(0);

    // The deterministic matcher, called directly, reproduces the audited
    // "live re-assessment": possible_match at 60% confidence.
    const assessment = assessHealthKitStrengthLinkCandidates({
      canonicalWorkout: strengthWorkout,
      canonicalObjects: fixture.canonicalEvidenceObjects,
      existingLinks: fixture.workoutLinks,
      canonicalWorkouts: fixture.canonicalWorkouts,
    });
    expect(assessment.outcome).toBe(HealthKitStrengthMatchOutcome.POSSIBLE);
    expect(assessment.candidates[0]).toMatchObject({ confidence: 60, loggerSessionCanonicalId: fixture.ids.session });

    const presentation = projectHealthKitStrengthWorkoutPresentationBySession(fixture);
    expect(presentation.get(fixture.ids.session)).toMatchObject({
      canonicalWorkoutId: fixture.ids.strengthWorkout,
      family: "strength",
      relationship: { status: "candidate", matchOutcome: "possible_match", confidence: 60 },
      session: {
        startedAt: "2026-09-24T18:22:10.000Z",
        endedAt: "2026-09-24T18:50:09.000Z",
        durationSeconds: 1679,
        activeCalories: 206.205,
        averageHeartRate: 120.14,
      },
    });

    // This is presentation-only: it never created, confirmed, or altered any
    // healthKitWorkoutLinks row, and the Logger session's own frozen evidence
    // is untouched.
    expect(fixture.workoutLinks).toEqual([]);
    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    expect(logger.payload.metadata.duration_seconds).toBe(5647);
    expect(logger.payload.metadata.end_time).toBeUndefined();
  });

  it("leaves the confirmed September 23 case byte-identical to the confirmed-only projection", () => {
    const fixture = createSep23StrengthPresentationFixture();
    const confirmedOnly = projectConfirmedHealthKitWorkoutAttachments(fixture);
    const presentation = projectHealthKitStrengthWorkoutPresentationBySession(fixture);
    expect(presentation.get(fixture.ids.session)).toEqual(confirmedOnly[0]);
    expect(presentation.get(fixture.ids.session).relationship.status).toBe("confirmed");
  });

  it("falls back to the Logger's own timing when no plausible HK candidate exists at all", () => {
    const fixture = createSep24StrengthPresentationFixture();
    fixture.canonicalWorkouts = [];
    const presentation = projectHealthKitStrengthWorkoutPresentationBySession(fixture);
    expect(presentation.has(fixture.ids.session)).toBe(false);
  });

  it("never selects a non-Strength workout (Indoor Walk) as the Strength Logger session's presentation candidate", () => {
    const fixture = createSep24StrengthPresentationFixture();
    // Remove the real Strength workout; keep only the two Indoor Walk
    // workouts, one of which (`walkAfter`) sits entirely inside the Logger
    // session's own synthetic window and would otherwise look temporally
    // plausible.
    const walkAfter = fixture.canonicalWorkouts.find((workout) => workout.id === fixture.ids.walkAfter);
    fixture.canonicalWorkouts = fixture.canonicalWorkouts.filter((workout) => workout.id !== fixture.ids.strengthWorkout);

    const assessment = assessHealthKitStrengthLinkCandidates({
      canonicalWorkout: walkAfter,
      canonicalObjects: fixture.canonicalEvidenceObjects,
      existingLinks: fixture.workoutLinks,
      canonicalWorkouts: fixture.canonicalWorkouts,
    });
    expect(assessment.outcome).toBe(HealthKitStrengthMatchOutcome.NONE);
    expect(assessment.reason).toBe("not_a_strength_workout");

    const presentation = projectHealthKitStrengthWorkoutPresentationBySession(fixture);
    expect(presentation.has(fixture.ids.session)).toBe(false);
  });

  it("presents the corrected HK telemetry on the Activity-Linked-Training-Context list without changing energy attribution", () => {
    const fixture = createSep24StrengthPresentationFixture();
    const report = createProviderActivityEvidenceReport(fixture);
    const day = report.latestActivityDay;

    // Unconfirmed: accounting must not count this workout's energy, and the
    // confidence/eligibility machinery is untouched by this presentation fix.
    expect(day.workoutEnergyAttribution.confirmedHealthKitWorkoutCount).toBe(0);
    expect(day.linkedTrainingSessionCount).toBe(1);

    const entry = report.linkedTrainingContext.find((item) => item.id === fixture.ids.session);
    expect(entry).toMatchObject({
      value: "206 active cal",
      sourceEvidence: ["Workout Logger", "Apple Health"],
      healthKitPresentation: { status: "candidate", matchOutcome: "possible_match", confidence: 60 },
    });
    expect(entry.detail).toContain("28 min");
    expect(entry.detail).not.toContain("94 min");
  });

  it("attaches the unconfirmed candidate's real Apple telemetry to Workout Detail, keeping the two Logger exercises attached and correct", async () => {
    const fixture = createSep24StrengthPresentationFixture();
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
    expect(session.exercises).toHaveLength(2);
    expect(session.healthKitAttachment).toMatchObject({
      relationship: { status: "candidate", matchOutcome: "possible_match", confidence: 60 },
      source: { application: "Apple Health", sourceName: "Apple Watch" },
      session: { activeCalories: 206.205, durationSeconds: 1679, averageHeartRate: 120.14 },
    });
    // The Workout-Detail telemetry block itself must show the real ~28-minute
    // HK window, never the Logger's own frozen 94-minute synthetic one.
    expect(session.telemetry).toMatchObject({
      startTime: "2026-09-24T18:22:10.000Z",
      endTime: "2026-09-24T18:50:09.000Z",
      durationSeconds: 1679,
    });
    expect(logger.payload.exercises).toEqual(exercisesBefore);
    expect(logger.payload.metadata.duration_seconds).toBe(5647);
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
});
