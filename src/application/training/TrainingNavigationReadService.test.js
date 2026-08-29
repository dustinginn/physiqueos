import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createTrainingPerformanceEvent } from "../../domain/models/trainingPerformanceEvent.js";
import { createTrainingReadService } from "./TrainingReadService.js";
import { createTrainingNavigationReadService } from "./TrainingNavigationReadService.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { getTrainingTimelineReport } from "../../domain/services/TrainingEvidenceContextService.js";
import { createRepositoryTrainingNavigationReadStore } from "../../platform/database/PostgresTrainingNavigationReadStore.js";
import { buildTrainingLibraryNavigation } from "../../navigation/navigationRegistry.js";
import TrainingKnowledgeScreen from "../../screens/TrainingKnowledgeScreen.jsx";

const principal = createAuthenticationPrincipal({ userId: "owner-one", deviceId: "device-one", sessionId: "session-one" });

describe("provider-native Training navigation", () => {
  it.each(["all", "build-lean-mass"])(
    "keeps the Training landing output equivalent for %s without broad report fields",
    async (context) => {
      const runtime = createPhase5SyntheticRuntime();
      const narrowRepositories = createSeedRepositories(structuredClone(runtime), {
        allowStagedMutations: false,
      });
      const legacyRepositories = createSeedRepositories(structuredClone(runtime), {
        allowStagedMutations: false,
      });
      const narrow = await createTrainingNavigationReadService({
        store: createRepositoryTrainingNavigationReadStore({
          repositories: narrowRepositories,
        }),
      }).getLanding({ context });
      const legacy = await getTrainingTimelineReport({
        context,
        repositories: legacyRepositories,
      });

      expect(narrow.timeline).toEqual(legacy.timeline);
      expect(projectLanding(narrow.report)).toEqual(projectLanding(legacy.report));
      expect(narrow.report).not.toHaveProperty("resistancePerformance");
      expect(narrow.report).not.toHaveProperty("trainingPatterns");
    }
  );

  it("keeps Training Day output equivalent while using the date-scoped read", async () => {
    const records = [training("session-a", "2026-08-26", "2026-08-26T08:00:00-07:00"), training("session-b", "2026-08-27")];
    const legacy = createTrainingReadService({ repositories: repositories(records) });
    const store = navigationStore(records);
    const narrow = createTrainingNavigationReadService({ store });

    expect(await narrow.getDay({ date: "2026-08-26" })).toEqual(
      await legacy.getDay({ principal, date: "2026-08-26", timeZone: "America/Los_Angeles" })
    );
    expect(store.listCanonicalTrainingEvidenceForDate).toHaveBeenCalledOnce();
    expect(store.listCanonicalTrainingEvidenceObjects).not.toHaveBeenCalled();
  });

  it("retrieves one session with aliases, sets, variants, and superset relationships", async () => {
    const record = training("canonical-session", "2026-08-26");
    record.provenance = { contributing_evidence_object_ids: ["source-alias"] };
    record.payload.exercises[0].executionVariant = { key: "incline", label: "Incline" };
    record.payload.exerciseRelationshipGroups = [{ relationshipType: "superset", memberExerciseIds: ["ez_bar_curl"] }];
    const store = navigationStore([record]);
    const session = await createTrainingNavigationReadService({ store }).getSession({ sessionId: "canonical-session" });

    expect(session).toMatchObject({
      id: "canonical-session",
      aliases: ["canonical-session", "payload-canonical-session", "source-alias"],
      exercises: [{ canonicalExerciseId: "ez_bar_curl", sets: [{ reps: 10, weight: 65, weight_unit: "lb" }] }],
      exerciseRelationshipGroups: [{ relationshipType: "superset" }],
    });
    expect(store.getCanonicalEvidenceObject).toHaveBeenCalledOnce();
    expect(store.listCanonicalTrainingEvidenceObjects).not.toHaveBeenCalled();
  });

  it("loads only one exercise's occurrences and events with unchanged scoped ordering", async () => {
    const records = [training("older", "2026-08-20"), training("newer", "2026-08-26")];
    const events = [performanceEvent("2026-08-26")];
    const store = navigationStore(records, events);
    const result = await createTrainingNavigationReadService({ store }).getExercise({
      context: "build-lean-mass",
      currentDate: new Date("2026-08-29T12:00:00Z"),
      exerciseSlug: "ez_bar_curl",
    });

    expect(result.timeline).toMatchObject({ contextId: "build-lean-mass", startDate: "2026-07-19", endDate: "2026-08-29" });
    expect(result.report.trainingDays.map((day) => day.date)).toEqual(["2026-08-26", "2026-08-20"]);
    expect(result.report.trainingDays.flatMap((day) => day.sessions).every((session) =>
      session.exercises.every((exercise) => exercise.canonicalExerciseId === "ez_bar_curl"))).toBe(true);
    expect(result.exerciseRecords).toMatchObject({ canonicalExerciseId: "ez_bar_curl", totalCount: 1 });
    expect(store.listCanonicalTrainingEvidenceByExercise).toHaveBeenCalledWith("ez_bar_curl");
    expect(store.listTrainingPerformanceEventsByExercise).toHaveBeenCalledWith("ez_bar_curl");
  });

  it("keeps consecutive exercise requests request-local and free of broad timeline calls", async () => {
    const store = navigationStore([training("session-a", "2026-08-26")]);
    const service = createTrainingNavigationReadService({ store });
    const first = await service.getExercise({ context: "all", exerciseSlug: "ez_bar_curl" });
    const second = await service.getExercise({ context: "all", exerciseSlug: "ez_bar_curl" });
    expect(store.run).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
    expect(JSON.stringify(first).length).toBeLessThan(100_000);

    const route = fs.readFileSync("src/app/progress/training/library/[[...path]]/page.js", "utf8");
    const metadata = route.slice(route.indexOf("export async function generateMetadata"), route.indexOf("export default async function"));
    expect(metadata).not.toContain("getTrainingTimelineReport");
    expect(route).toContain("trainingNavigation.getExercise");
  });

  it.each(["all", "build-lean-mass"])(
    "keeps Training Library category output equivalent for %s without a broad timeline",
    async (context) => {
      const runtime = createPhase5SyntheticRuntime();
      const narrowRepositories = createSeedRepositories(structuredClone(runtime), {
        allowStagedMutations: false,
      });
      const legacyRepositories = createSeedRepositories(structuredClone(runtime), {
        allowStagedMutations: false,
      });
      const narrow = await createTrainingNavigationReadService({
        store: createRepositoryTrainingNavigationReadStore({
          repositories: narrowRepositories,
        }),
      }).getLibrary({ context, path: ["biceps"] });
      const legacy = await getTrainingTimelineReport({
        context,
        repositories: legacyRepositories,
      });

      expect(narrow.timeline).toEqual(legacy.timeline);
      expect(narrow.report.trainingBreakdowns).toEqual(
        legacy.report.trainingBreakdowns
      );
      expect(renderLibrary(narrow, ["biceps"])).toEqual(
        renderLibrary(legacy, ["biceps"])
      );
      expect(narrow.report).not.toHaveProperty("latestTrainingDay");
      expect(narrow.report).not.toHaveProperty("trainingLibrary");
      expect(narrow.report).not.toHaveProperty("resistancePerformance");
    }
  );

  it("keeps library reads request-local and preserves cardio history only when requested", async () => {
    const cardio = training("walk", "2026-08-26");
    cardio.payload.metadata.activity_type = "Outdoor Walk";
    cardio.payload.exercises = [];
    const store = navigationStore([
      training("strength", "2026-08-27"),
      cardio,
    ]);
    const service = createTrainingNavigationReadService({ store });
    const root = await service.getLibrary({ context: "all", path: [] });
    const activity = await service.getLibrary({
      context: "all",
      path: ["cardio", "outdoor-walk"],
    });

    expect(root.report.trainingDays).toEqual([]);
    expect(activity.report.trainingDays).toHaveLength(1);
    expect(activity.report.trainingDays[0].sessions[0].label).toBe("Outdoor Walk");
    expect(store.run).toHaveBeenCalledTimes(2);
    expect(store.listCanonicalTrainingEvidenceObjects).toHaveBeenCalledTimes(2);
  });

  it("removes compatibility-runtime/report construction from Day and Session routes", () => {
    const day = fs.readFileSync("src/app/progress/training/day/[date]/page.js", "utf8");
    const session = fs.readFileSync("src/app/progress/training/session/[sessionId]/page.js", "utf8");
    expect(day).not.toMatch(/FounderRepositories|createInactiveLegacyWebContext|createTrainingReadService/);
    expect(session).not.toMatch(/FounderRepositories|createProgressReportingService|getPlaceholderReport/);
    expect(day).toContain("getProductionTrainingNavigationReadService");
    expect(session).toContain("getProductionTrainingNavigationReadService");
  });
});

function navigationStore(records, events = []) {
  const user = { id: "owner-one", timezone: "America/Los_Angeles" };
  return {
    run: vi.fn((_name, callback) => callback()),
    getUser: vi.fn(async () => user),
    listGoals: vi.fn(async () => [{ id: "goal-build", type: "build_lean_mass", status: "active", updatedAt: "2026-08-15" }]),
    listCanonicalTrainingAndActivityEvidenceObjects: vi.fn(async () => records),
    getCanonicalEvidenceObject: vi.fn(async (id) => records.find((record) => record.canonicalId === id) ?? null),
    listCanonicalTrainingEvidenceObjects: vi.fn(async () => records),
    listCanonicalTrainingEvidenceForDate: vi.fn(async (date) => records.filter((record) => record.payload.observed_at.slice(0, 10) === date)),
    listCanonicalTrainingEvidenceByExercise: vi.fn(async (id) => records.filter((record) => record.payload.exercises.some((exercise) => exercise.canonicalExerciseId === id))),
    listEvidencePackages: vi.fn(async () => []),
    listTrainingPerformanceEventsByExercise: vi.fn(async (id) => events.filter((event) => event.canonicalExerciseId === id)),
  };
}

function renderLibrary(result, path) {
  const baseNavigation = buildTrainingLibraryNavigation(path);
  const adaptHref = (href) => `${href}?context=${result.timeline.contextId}`;
  return renderToStaticMarkup(React.createElement(TrainingKnowledgeScreen, {
    mode: "library",
    navigation: {
      ...baseNavigation,
      breadcrumbs: baseNavigation.breadcrumbs.map((item) => ({
        ...item,
        href: adaptHref(item.href),
      })),
    },
    report: result.report,
    slug: path,
    trainingEvidenceContext: { adaptHref, showSourceWorkouts: false },
  }));
}

function projectLanding(report) {
  const fields = [
    "id",
    "title",
    "description",
    "tone",
    "status",
    "summary",
    "dataSources",
    "entries",
    "relatedGoals",
    "latestTrainingDay",
    "currentProtocol",
    "reportingLinks",
    "trainingLibrary",
    "trainingDays",
    "trainingBreakdowns",
    "sourceEvidence",
    "reportPattern",
    "evidenceWindow",
  ];
  return Object.fromEntries(fields.map((field) => [field, report[field]]));
}

function repositories(records) {
  return {
    canonicalEvidence: { listCanonicalEvidenceObjects: async () => records },
    users: { getUserById: async () => ({ id: "owner-one", timezone: "America/Los_Angeles" }) },
  };
}

function training(id, observedAt, capturedAt = `${observedAt}T12:00:00Z`) {
  return {
    canonicalId: id,
    quality: { status: "active" },
    payload: {
      id: `payload-${id}`,
      evidence_type: "training",
      observed_at: observedAt,
      captured_at: capturedAt,
      metadata: { activity_type: "Resistance Training", duration_seconds: 3600, active_calories: 400 },
      exercises: [{
        id: "exercise-entry",
        name: "EZ Bar Curls",
        canonicalExerciseId: "ez_bar_curl",
        sets: [{ reps: 10, weight: 65, weight_unit: "lb" }],
      }],
      exerciseRelationshipGroups: [],
    },
  };
}

function performanceEvent(workoutDate) {
  return createTrainingPerformanceEvent({
    eventType: "session_volume_pr",
    sourceReviewId: "review",
    sourceEvidencePackageId: "package",
    sourceCanonicalTrainingId: `canonical-${workoutDate}`,
    sourceSessionId: `session-${workoutDate}`,
    sourceAnalysisId: "analysis",
    workoutDate,
    canonicalExerciseId: "ez_bar_curl",
    canonicalExerciseName: "EZ Bar Curls",
    currentValue: 650,
    previousBaselineValue: 585,
    sessionVolume: 650,
    unit: "lb",
    createdAt: `${workoutDate}T12:00:00Z`,
  });
}
