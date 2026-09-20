import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createTrainingPerformanceEvent } from "../../domain/models/trainingPerformanceEvent.js";
import { createTrainingReadService } from "./TrainingReadService.js";
import { createTrainingNavigationReadService } from "./TrainingNavigationReadService.js";
import { registerRuntimeTrainingExercises } from "../../domain/models/trainingExerciseIdentity.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { getTrainingTimelineReport } from "../../domain/services/TrainingEvidenceContextService.js";
import { createRepositoryTrainingNavigationReadStore } from "../../platform/database/PostgresTrainingNavigationReadStore.js";
import { buildTrainingLibraryNavigation } from "../../navigation/navigationRegistry.js";
import TrainingKnowledgeScreen from "../../screens/TrainingKnowledgeScreen.jsx";

const principal = createAuthenticationPrincipal({ userId: "owner-one", deviceId: "device-one", sessionId: "session-one" });

describe("Founder-created canonical exercise resolution on a fresh process", () => {
  afterEach(() => registerRuntimeTrainingExercises([]));

  const founderCreatedExercise = Object.freeze({
    id: "bicep_curl_machine",
    name: "Bicep Curl Machine",
    aliases: [],
    equipment: "machine",
    body_region: "upper_body",
    primary_muscle_group_id: "biceps",
    primary_muscle_groups: ["Biceps"],
    movement_pattern: null,
    modifiers: [],
    secondary_muscle_groups: [],
  });

  function bicepSession() {
    const record = training("bicep-session", "2026-08-29");
    record.payload.exercises[0] = {
      id: "exercise-entry",
      name: "Bicep Curl Machine",
      canonicalExerciseId: "bicep_curl_machine",
      body_region: "upper_body",
      sets: [{ reps: 12, weight: 120, weight_unit: "lb" }],
    };
    return record;
  }

  it("fails to resolve a Founder-created exercise's detail without registry hydration (reproduces the fresh-deploy failure)", async () => {
    registerRuntimeTrainingExercises([]); // module-global registry as it is on a fresh process, before any canonical write has run
    const store = navigationStore([bicepSession()]);
    const service = createTrainingNavigationReadService({ store }); // no hydrateCanonicalExerciseRegistry injected
    const result = await service.getExercise({ context: "all", exerciseSlug: "bicep_curl_machine" });

    expect(result.exerciseRecords).toBeNull();
    expect(result.report.trainingDays).toEqual([]);
  });

  it("resolves the Founder-created exercise's detail on the very first read once the registry is hydrated explicitly", async () => {
    registerRuntimeTrainingExercises([]);
    const store = navigationStore([bicepSession()]);
    let hydrateCalls = 0;
    const service = createTrainingNavigationReadService({
      store,
      hydrateCanonicalExerciseRegistry: async () => {
        hydrateCalls += 1;
        // Simulates the bounded provider read of canonicalExerciseLibrary that
        // hydrateProductionTrainingExerciseRegistry performs before this call.
        registerRuntimeTrainingExercises([founderCreatedExercise]);
      },
    });
    const result = await service.getExercise({ context: "all", exerciseSlug: "bicep_curl_machine" });

    expect(hydrateCalls).toBe(1);
    expect(result.report.trainingDays).toHaveLength(1);
    expect(result.report.trainingDays[0].sessions[0].exercises[0].canonicalExerciseId).toBe(
      "bicep_curl_machine"
    );
    expect(store.listCanonicalTrainingEvidenceByExercise).toHaveBeenCalledWith("bicep_curl_machine");
  });

  it("resolves the Founder-created exercise in Library browse on the very first read once hydrated", async () => {
    registerRuntimeTrainingExercises([]);
    const store = navigationStore([bicepSession()]);
    const service = createTrainingNavigationReadService({
      store,
      hydrateCanonicalExerciseRegistry: async () => registerRuntimeTrainingExercises([founderCreatedExercise]),
    });
    const result = await service.getLibrary({ context: "all", path: ["biceps"] });
    const exerciseIds = (result.report.trainingBreakdowns.resistance ?? []).flatMap((region) =>
      region.movementFamilies.flatMap((family) =>
        family.exercises.map((exercise) => exercise.canonicalExerciseId)
      )
    );

    expect(exerciseIds).toContain("bicep_curl_machine");
  });

  it("projects an active canonical exercise into Library browse before it has history", async () => {
    registerRuntimeTrainingExercises([]);
    const store = navigationStore([]);
    const service = createTrainingNavigationReadService({
      store,
      readCanonicalExerciseRegistry: async () => {
        registerRuntimeTrainingExercises([founderCreatedExercise]);
        return [founderCreatedExercise];
      },
    });

    const result = await service.getLibrary({ context: "all", path: ["biceps"] });

    expect(result.report.canonicalExercises).toEqual([
      expect.objectContaining({
        canonicalExerciseId: "bicep_curl_machine",
        label: "Bicep Curl Machine",
        primaryMuscleGroupId: "biceps",
      }),
    ]);
    expect(result.report.trainingBreakdowns.resistance).toEqual([]);
    expect(store.listCanonicalTrainingEvidenceObjects).toHaveBeenCalledOnce();
  });

  it("does not require a prior canonical write in the same process to become visible", async () => {
    registerRuntimeTrainingExercises([]);
    const store = navigationStore([bicepSession()]);
    const service = createTrainingNavigationReadService({
      store,
      hydrateCanonicalExerciseRegistry: async () => registerRuntimeTrainingExercises([founderCreatedExercise]),
    });

    // The very first call this service ever makes in this process already resolves
    // correctly -- nothing upstream registered the exercise beforehand.
    const result = await service.getExercise({ context: "all", exerciseSlug: "bicep_curl_machine" });
    expect(result.report.trainingDays).toHaveLength(1);
  });

  it("routes Training Day and Session through the same registry access boundary", async () => {
    const store = navigationStore([bicepSession()]);
    const readCanonicalExerciseRegistry = vi.fn(async () => {
      registerRuntimeTrainingExercises([founderCreatedExercise]);
      return [founderCreatedExercise];
    });
    const service = createTrainingNavigationReadService({
      store,
      readCanonicalExerciseRegistry,
    });

    await service.getDay({ date: "2026-08-29" });
    await service.getSession({ sessionId: "bicep-session" });

    expect(readCanonicalExerciseRegistry).toHaveBeenCalledTimes(2);
  });

  it("does not repeat provider hydration when the route already hydrated before path resolution", async () => {
    registerRuntimeTrainingExercises([founderCreatedExercise]);
    const readCanonicalExerciseRegistry = vi.fn();
    const service = createTrainingNavigationReadService({
      store: navigationStore([bicepSession()]),
      readCanonicalExerciseRegistry,
    });

    const result = await service.getExercise({
      context: "all",
      exerciseSlug: "bicep_curl_machine",
      registryHydrated: true,
    });

    expect(readCanonicalExerciseRegistry).not.toHaveBeenCalled();
    expect(result.report.trainingDays).toHaveLength(1);
  });
});

describe("provider-native Training navigation", () => {
  it.each(["all", "build-lean-mass"])(
    "keeps Training reporting output equivalent for %s without runtime reconstruction",
    async (context) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-31T14:00:00.000Z"));
      const runtime = createPhase5SyntheticRuntime();
      const narrowRepositories = createSeedRepositories(structuredClone(runtime), { allowStagedMutations: false });
      const legacyRepositories = createSeedRepositories(structuredClone(runtime), { allowStagedMutations: false });
      const narrow = await createTrainingNavigationReadService({
        store: createRepositoryTrainingNavigationReadStore({ repositories: narrowRepositories }),
      }).getReporting({ context });
      const legacy = await getTrainingTimelineReport({ context, repositories: legacyRepositories });
      expect(narrow.timeline).toEqual(legacy.timeline);
      expect(narrow.report).toEqual(legacy.report);
      expect(narrow.presentation).toMatchObject({
        schemaVersion: "1",
        resistance: { title: "Resistance Training" },
        history: { title: "Training History" },
      });
      expect(narrow.report.resistancePerformance).toBeDefined();
      const route = fs.readFileSync("src/app/progress/training/reporting/[reportId]/page.js", "utf8");
      expect(route).toContain("getProductionTrainingNavigationReadService().getReporting");
      expect(route).not.toContain("getTrainingTimelineReport");
      vi.useRealTimers();
    }
  );

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

  it("Build 33: separates structured workout-level telemetry from the generated detail summary", async () => {
    const record = training("canonical-session-telemetry", "2026-09-14");
    record.payload.metadata = {
      activity_type: "Traditional Strength Training",
      start_time: "2026-09-14T07:45:00.000Z",
      end_time: "2026-09-14T08:44:00.000Z",
      duration_seconds: 3540,
      active_calories: 438,
      average_heart_rate: 121,
    };
    const session = await createTrainingNavigationReadService({ store: navigationStore([record]) })
      .getSession({ sessionId: "canonical-session-telemetry" });

    expect(session.telemetry).toEqual({
      startTime: "2026-09-14T07:45:00.000Z",
      endTime: "2026-09-14T08:44:00.000Z",
      durationSeconds: 3540,
      activeCalories: 438,
      averageHeartRate: 121,
    });
    // `detail` still carries the fallback summary for surfaces that show
    // only this string (Activity's linked-training-context rows, the
    // Training Library history list) -- the session detail SCREEN is the
    // only consumer that must prefer `telemetry` and skip `detail` when
    // structured exercises are present; that's a Native presentation
    // decision, not a server contract gap.
    expect(session.detail).toContain("121 bpm avg HR");
  });

  it("Build 33: returns no telemetry object when a session carries no workout-level telemetry at all", async () => {
    const record = training("canonical-session-no-telemetry", "2026-09-14");
    record.payload.metadata = { activity_type: "Traditional Strength Training" };
    const session = await createTrainingNavigationReadService({ store: navigationStore([record]) })
      .getSession({ sessionId: "canonical-session-no-telemetry" });

    expect(session.telemetry).toBeNull();
  });

  it("projects exact-session private supporting media without selecting a different workout", async () => {
    const record = training("canonical-session-media", "2026-08-26");
    record.payload.metadata.supporting_media = [
      { mediaReference: "media://01999999-9999-4999-8999-999999999999" },
    ];
    const session = await createTrainingNavigationReadService({ store: navigationStore([record]) })
      .getSession({ sessionId: "canonical-session-media" });
    expect(session.supportingMedia).toEqual([
      { mediaReference: "media://01999999-9999-4999-8999-999999999999" },
    ]);
  });

  it("loads only one exercise's occurrences and events with unchanged scoped ordering", async () => {
    const records = [training("older", "2026-08-20"), training("newer", "2026-08-26")];
    const events = [performanceEvent("2026-08-26", { canonicalId: "newer", sessionId: "payload-newer" })];
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

  it("presents a durable record only while its source session is an active canonical session", async () => {
    const active = training("newer", "2026-08-26");
    const event = performanceEvent("2026-08-26", { canonicalId: "newer", sessionId: "payload-newer" });
    const read = (records) => createTrainingNavigationReadService({ store: navigationStore(records, [event]) })
      .getExercise({ context: "all", currentDate: new Date("2026-08-29T12:00:00Z"), exerciseSlug: "ez_bar_curl" });
    expect((await read([active])).exerciseRecords).toMatchObject({ canonicalExerciseId: "ez_bar_curl", totalCount: 1 });

    // The source session becomes superseded: the immutable event is not deleted
    // but it can no longer override current Training truth.
    const superseded = { ...active, quality: { status: "superseded", supersededBy: "elsewhere" } };
    expect((await read([superseded])).exerciseRecords).toBeNull();
    expect(event.sourceCanonicalTrainingId).toBe("newer");
  });

  it("does not hide a valid record whose session stores a legacy exercise id the scoped query cannot match", async () => {
    // The session stores a legacy id; the event carries the identity-resolved id.
    const legacy = training("legacy-session", "2026-08-26");
    legacy.payload.exercises[0] = { id: "exercise-entry", name: "Seated Hip Adductions", canonicalExerciseId: "seated_abductions", sets: [{ reps: 10, weight: 65, weight_unit: "lb" }] };
    const event = {
      ...performanceEvent("2026-08-26", { canonicalId: "legacy-session", sessionId: "payload-legacy-session" }),
      canonicalExerciseId: "seated_hip_adductions", canonicalExerciseName: "Seated Hip Adductions",
    };
    const store = navigationStore([legacy], [event]);
    store.listCanonicalTrainingEvidenceByExercise = vi.fn(async () => []);
    const result = await createTrainingNavigationReadService({ store }).getExercise({
      context: "all", currentDate: new Date("2026-08-29T12:00:00Z"), exerciseSlug: "seated_hip_adductions",
    });
    expect(result.exerciseRecords).toMatchObject({ canonicalExerciseId: "seated_hip_adductions", totalCount: 1 });
    expect(store.listCanonicalTrainingEvidenceObjects).toHaveBeenCalled();
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
      expect(narrow.report.canonicalExercises).toEqual(expect.any(Array));
      const narrowMarkup = renderLibrary(narrow, ["biceps"]);
      const legacyMarkup = renderLibrary(legacy, ["biceps"]);
      expect(narrowMarkup).toContain("Synthetic Curl");
      expect(legacyMarkup).toContain("Synthetic Curl");
      expect(narrowMarkup.match(/Synthetic Curl/g)).toHaveLength(1);
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

  it("hydrates the canonical exercise registry before deciding exercise-detail vs. library browse", () => {
    // path.at(-1) is resolved against the canonical registry to decide whether the route
    // reads getExercise or falls back to getLibrary. That decision runs before either read
    // service call, so the registry must already be hydrated by the time it happens or a
    // Founder-created exercise's detail URL silently falls back to a library-shaped read.
    const route = fs.readFileSync("src/app/progress/training/library/[[...path]]/page.js", "utf8");
    const defaultExport = route.slice(route.indexOf("export default async function"));
    expect(defaultExport.indexOf("readProductionTrainingExerciseRegistry")).toBeGreaterThan(-1);
    expect(defaultExport.indexOf("readProductionTrainingExerciseRegistry")).toBeLessThan(
      defaultExport.indexOf("resolveTrainingExerciseIdentity(path.at(-1))")
    );
  });

  it("hydrates the canonical exercise registry before Map existing reads canonical exercise options", () => {
    const route = fs.readFileSync("src/app/evidence/review/[reviewId]/page.js", "utf8");
    expect(route.indexOf("readProductionTrainingExerciseRegistry")).toBeGreaterThan(-1);
    expect(route).toContain(
      "const canonicalExercises = await readProductionTrainingExerciseRegistry()"
    );
    expect(route).toContain("canonicalExercises={canonicalExercises}");
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

function performanceEvent(workoutDate, { canonicalId = `canonical-${workoutDate}`, sessionId = `session-${workoutDate}` } = {}) {
  return createTrainingPerformanceEvent({
    eventType: "session_volume_pr",
    sourceReviewId: "review",
    sourceEvidencePackageId: "package",
    sourceCanonicalTrainingId: canonicalId,
    sourceSessionId: sessionId,
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
