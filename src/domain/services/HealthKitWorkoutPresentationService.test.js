import { describe, expect, it } from "vitest";
import { projectConfirmedHealthKitLogProvenance } from "../../application/core/CoreNavigationReadService.js";
import { createProviderActivityEvidenceReport } from "./ProgressReportingService.js";
import { projectConfirmedHealthKitWorkoutAttachments } from "./HealthKitWorkoutPresentationService.js";
import { createSep23StrengthPresentationFixture } from "../../fixtures/healthKitSep23StrengthPresentationFixture.js";
import { createTrainingNavigationReadService } from "../../application/training/TrainingNavigationReadService.js";
import { getHealthKitWorkoutLinkRecordId } from "./HealthKitWorkoutLinkService.js";
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
