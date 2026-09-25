import { describe, expect, it } from "vitest";
import {
  projectNativePhotosRead,
  projectNativeTrainingLandingRead,
  projectNativeTrainingLibraryRead,
  projectNativeTrainingReportingRead,
  projectNativeWeightRead,
} from "./NativeReadProjectionService.js";
import { projectClientSafeValue } from "../read-models/readModel.js";

const mediaId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";

describe("Native finished read projections", () => {
  it("bounds canonical newest-first Weight history while preserving revision, trend, extrema, DEXA, Goal, and Phase context", () => {
    const history = [3, 2, 1].map((revision) => ({
      id: `weight-${revision}`, date: `2026-09-0${revision}`, value: 170 + revision,
      unit: "lb", revision,
    }));
    const result = projectNativeWeightRead({
      limit: 2,
      timeline: { contextId: "build-lean-mass", type: "active_goal", goalId: "goal-1", phaseId: "phase-2" },
      report: {
        current: history[0], history, recentWeighIns: history,
        rollingAverages: { threeDay: { value: 172 }, sevenDay: { value: 171.5 } },
        weeklyAverages: [{ week: "2026-W36", average: 171.5 }],
        extrema: { goalRelevant: ["highest"], highest: history[0], lowest: history[2] },
        chart: { markers: [{ id: "dexa-1", date: "2026-08-31", label: "DEXA" }] },
      },
    });
    expect(result).toMatchObject({
      context: { goalId: "goal-1", phaseId: "phase-2" },
      current: { id: "weight-3", revision: 3 },
      rollingAverages: { threeDay: { value: 172 }, sevenDay: { value: 171.5 } },
      extrema: { goalRelevant: ["highest"] },
      dexaContext: { latest: { id: "dexa-1" } },
      page: { limit: 2, count: 2, hasMore: true },
    });
    expect(result.history.map((item) => item.id)).toEqual(["weight-3", "weight-2"]);
  });

  it("returns only canonical Photo comparison fields and media references", () => {
    const result = projectNativePhotosRead({
      limit: 1,
      timeline: { contextId: "visible-abs", goalId: "goal-1", phaseId: "phase-1" },
      photoSessions: [{
        id: "session-current", revision: 4, captureDate: "2026-07-11", goalId: "goal-1", phaseId: "phase-1",
        completionStatus: "complete", comparisonAvailability: "1/1 poses have prior comparisons",
        sessionFingerprint: "must-not-escape", hiddenProvenanceAliases: ["must-not-escape"],
        views: [{
          canonicalPhotoId: "photo-current", poseId: "front-relaxed",
          pose: { id: "front-relaxed", label: "Front Relaxed", view: "front", pose: "relaxed" },
          captureDate: "2026-07-11", comparisonStatus: "comparable",
          galleryInterpretation: {
            summary: "Canonical interpretation.",
            comparisonBullets: ["Waist looks tighter."],
            conditionSummary: "Comparable light and distance.",
            internalPrompt: "must-not-escape",
          },
          sourceHistory: "Compared Jul 3 and Jul 11.",
          imageHref: `/api/private-evidence/media/${mediaId}`,
          imageReference: "private/storage/key.jpg",
          comparison: {
            previousSessionId: "session-prior", previousCanonicalViewId: "photo-prior",
            previousDate: "2026-07-03", previousPose: { id: "front-relaxed" },
            previousImageHref: `/api/private-evidence/media/${mediaId}`,
          },
        }],
      }],
    });
    expect(result.sessions[0]).toMatchObject({
      sessionId: "session-current", revision: 4, intendedCaptureDate: "2026-07-11",
      photos: [{
        photoId: "photo-current", poseId: "front-relaxed", comparisonStatus: "comparable",
        galleryInterpretation: {
          summary: "Canonical interpretation.",
          comparisonBullets: ["Waist looks tighter."],
          conditionSummary: "Comparable light and distance.",
        },
        sourceHistory: "Compared Jul 3 and Jul 11.",
        prior: { sessionId: "session-prior", photoId: "photo-prior", intendedCaptureDate: "2026-07-03" },
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(/sessionFingerprint|hiddenProvenance|internalPrompt|storage|path|provider/i);
  });

  it("does not expose raw Training report primitives to Native", () => {
    const result = projectNativeTrainingReportingRead({
      timeline: { contextId: "all", type: "all_history" },
      report: { resistancePerformance: { internal: true } },
      presentation: { schemaVersion: "1", resistance: { title: "Resistance Training" } },
    });
    expect(result.reporting.resistance.title).toBe("Resistance Training");
    expect(result).not.toHaveProperty("report");
  });
});

describe("Native Training landing/library projections (performance)", () => {
  const session = {
    id: "session-1", label: "Upper", value: "5 exercises", detail: "42 min", date: "2026-09-24",
    sourceEvidence: ["Logger"], href: "/progress/training/session/session-1",
    exercises: [{ name: "Bench Press", sets: [{ reps: 8, load: 185 }] }], rawSets: new Array(50).fill({ reps: 1 }),
  };
  const day = {
    date: "2026-09-24", href: "/progress/training/day/2026-09-24", id: "training-day-2026-09-24",
    sessions: [session], label: "Sep 24", summary: "1 session",
  };
  const landing = {
    timeline: { contextId: "all", dateRangeLabel: "All time", options: [] },
    report: {
      title: "Training", subtitle: "Recent", tone: "effort", metric: "12", trend: "up",
      latestTrainingDay: day, reportingLinks: [{ id: "volume", label: "Volume", detail: "d", href: "/progress/training/reports/volume" }],
      trainingDays: [day], currentProtocol: { sourceOfTruth: "a", dailyActivityTarget: "b", resistanceTraining: "c", goal: "d" },
      relatedGoals: [{ id: "goal-1", title: "Build", href: "/goals/goal-1" }], sourceEvidence: [{ id: "e", label: "l", date: "2026-09-24", sources: [] }],
      entries: [session, session], trainingBreakdowns: [{ id: "chest", sessions: [session] }], trainingLibrary: [{ id: "x" }], dataSources: ["a"],
    },
  };

  it("keeps exactly the landing keys Native decodes and drops undecoded history", () => {
    const projected = projectNativeTrainingLandingRead(landing);
    expect(Object.keys(projected)).toEqual(["timeline", "report"]);
    expect(projected.timeline).toEqual(landing.timeline);
    expect(Object.keys(projected.report)).toEqual([
      "title", "subtitle", "tone", "latestTrainingDay", "reportingLinks", "trainingDays",
      "currentProtocol", "relatedGoals", "sourceEvidence",
    ]);
    for (const key of ["title", "subtitle", "tone", "reportingLinks", "currentProtocol", "relatedGoals", "sourceEvidence"]) {
      expect(projected.report[key]).toEqual(landing.report[key]);
    }
    const expectedDay = {
      date: day.date, href: day.href, label: day.label, summary: day.summary,
      sessions: [{ id: "session-1", label: "Upper", value: "5 exercises", detail: "42 min", date: "2026-09-24", sourceEvidence: ["Logger"], href: session.href }],
    };
    expect(projected.report.trainingDays).toEqual([expectedDay]);
    expect(projected.report.latestTrainingDay).toEqual(expectedDay);
    expect(JSON.stringify(projected).length).toBeLessThan(JSON.stringify(landing).length / 3);
  });

  it("still yields Native destinations after the envelope's client-safe projection", () => {
    const projected = projectClientSafeValue(projectNativeTrainingLandingRead(landing), { canonicalGoalDestinations: true });
    const original = projectClientSafeValue(landing, { canonicalGoalDestinations: true });
    expect(projected.report.trainingDays[0].destination).toEqual(original.report.trainingDays[0].destination);
    expect(projected.report.trainingDays[0].sessions[0].destination).toEqual(original.report.trainingDays[0].sessions[0].destination);
    expect(projected.report.relatedGoals).toEqual(original.report.relatedGoals);
    expect(projected.report.reportingLinks).toEqual(original.report.reportingLinks);
  });

  it("keeps library timeline, membership and canonical exercises only", () => {
    const library = {
      timeline: landing.timeline, myLibraryExerciseIds: ["bench_press"],
      report: { canonicalExercises: [{ canonicalExerciseId: "bench_press", label: "Bench Press" }], trainingBreakdowns: [{ id: "chest" }], entries: [], trainingDays: [] },
    };
    const projected = projectNativeTrainingLibraryRead(library);
    expect(projected).toEqual({ timeline: library.timeline, myLibraryExerciseIds: ["bench_press"], report: { canonicalExercises: library.report.canonicalExercises } });
  });

  it("tolerates absent optional structures", () => {
    expect(projectNativeTrainingLandingRead({ timeline: null, report: { title: "T", trainingDays: [], latestTrainingDay: null } }).report)
      .toEqual({ title: "T", trainingDays: [], latestTrainingDay: null });
    expect(projectNativeTrainingLibraryRead({ report: null }).report).toEqual({});
  });
});
