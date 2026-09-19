import { describe, expect, it, vi } from "vitest";
import { createNativeProductionContractService } from "./NativeProductionContractService.js";
import { nativeProductionContractManifest } from "./nativeProductionContractManifest.js";

const OWNER = "user_founder_001";
const principal = Object.freeze({
  userId: OWNER,
  deviceId: "device-native-001",
  sessionId: "session-native-001",
  scopes: Object.freeze(["founder:read", "founder:write"]),
});

function fixture(overrides = {}) {
  const call = (value = {}) => vi.fn(async () => value);
  const readers = {
    core: {
      getProfile: call({ id: OWNER, displayName: "Founder", timeZone: "America/Los_Angeles" }),
      getHome: call({ confidence: { score: 62, band: "Moderate" } }),
      getGoals: call({ active: { id: "goal-build" } }),
      getOperatingPlan: call({ goalId: "goal-build", phaseId: "phase-2" }),
      getMorningCheckIn: call({ today: "2026-09-09" }),
      getTrainingLogger: call({ initialDate: "2026-09-09" }),
      getTrainingMyLibrary: call([]),
      getLog: call({ reviews: [] }),
      getRecurringSupport: call({ protocolId: "protocol-recovery-1", protocolCategory: "recovery", executionId: "execution_foam_roll", reminderId: "reminder_foam_roll_daily", hydration: { executionRevision: 1 } }),
      getNutritionStrategyDetail: call({ protocolId: "nutrition-protocol", title: "Macro Strategy", editor: { expectedCurrentVersionId: "nutrition-protocol_v1" } }),
      getTrainingStrategyDetail: call({ protocolId: "training-protocol", title: "Current Training Strategy", editor: { expectedCurrentVersionId: "training-protocol_v1" } }),
      getPeptideSupport: call({ protocolId: "peptide-protocol", executionId: "execution-peptide", executionRevision: 2, name: "Retatrutide" }),
      getOperatingPlanProtocolDomain: call({ category: "peptide", title: "Peptide Strategy", methods: [] }),
      getSupplementSupport: call({ protocolId: "supplement-protocol", supplementVersionId: "supplement-protocol_v1", executionRevision: 2 }),
      getSupplementStrategyEditor: call({ mode: "edit", protocolId: "supplement-protocol", expectedCurrentVersionId: "supplement-protocol_v1" }),
      getEnergyStrategyDetail: call({ protocolId: "energy-protocol", intentionallyReadOnly: true }),
      getCoachingUpdatesDetail: call({ protocolId: "coaching-protocol", context: { expectedRevision: 85 } }),
    },
    activeGoal: { getPreview: call({ goalId: "goal-build", phaseId: "phase-2", confidence: { score: 62, band: "Moderate", movement: "held" } }) },
    completedGoal: { getVisibleAbs: call({ goalId: "goal-visible-abs", status: "completed" }) },
    priorities: { getPriorityDetail: call({ id: "priority-1" }) },
    weight: { getCurrentWeight: call({ canonicalId: "weight_2026_09_09", revision: 1 }) },
    training: {
      getLanding: call({ report: {} }),
      getReporting: call({
        timeline: { contextId: "all", type: "all_history" },
        report: { resistancePerformance: { raw: true } },
        presentation: { schemaVersion: "1", resistance: { title: "Resistance Training" } },
      }),
      getLibrary: call({ report: { canonicalExercises: [] } }),
      getDay: call({ date: "2026-09-09" }), getSession: call({ id: "session-1" }), getExercise: call({ id: "curl" }),
    },
    progress: {
      getWeight: call({
        timeline: { contextId: "all", type: "all_history" },
        report: {
          current: { id: "weight_2026_09_09", date: "2026-09-09", value: 170, unit: "lb", revision: 2 },
          recentWeighIns: [], rollingAverages: {}, weeklyAverages: [], extrema: {},
          chart: { markers: [] }, history: [],
        },
      }),
      getNutrition: call({ report: {} }),
      getActivity: call({ report: {} }),
      // Realistic unreconciled shape, matching ProgressEvidenceReadService.getEnergy's
      // real return value -- exercises the canonical Energy composition step rather
      // than a stub the composition service would reject.
      getEnergy: call({
        activityDays: [],
        dexaScans: [],
        nutritionDays: [],
        timeline: { contextId: "all", selectedLabel: "All Energy", options: [] },
      }),
      getDEXA: call({ report: {} }),
    },
    healthKitCanary: { getActivityValidation: call({ boundedRange: {}, items: [] }) },
    photos: { getNativePhotosTimeline: call({ sessions: [], page: { limit: 12, count: 0, hasMore: false } }) },
    briefings: { listNativeHistory: call({ items: [], page: { limit: 20, hasMore: false, nextCursor: null } }), getNativeArtifact: call({ artifact: { artifactId: "briefing-1" } }), getDexaArtifact: call({ artifact: { id: "dexa-event-1" } }) },
    photoEvents: { getPhotoEvent: call({ artifact: { id: "photo-event-1" } }) },
    evidenceReview: { getReview: call({ review: { id: "review-1", evidenceTypes: ["activity_day"] } }) },
    timeline: { getPage: call({ items: [], hasMore: false }) },
  };
  const executeCommand = vi.fn(async (input) => ({ outcome: "committed", commandType: input.commandType }));
  const confirmEvidenceReview = vi.fn(async ({ reviewId }) => ({ state: "processing", reviewId }));
  const evidenceIntake = {
    accept: vi.fn(async () => ({ status: "processing", intakeId: "intake-1" })),
    getStatus: vi.fn(async () => ({ status: "ready", intakeId: "intake-1", reviewId: "review-1" })),
  };
  const openMedia = vi.fn(async () => ({ url: "https://private.invalid/read" }));
  const service = createNativeProductionContractService({
    authenticate: overrides.authenticate ?? vi.fn(async () => principal),
    ownerUserId: OWNER,
    readers,
    executeCommand,
    confirmEvidenceReview,
    evidenceIntake,
    openMedia,
    now: () => new Date("2026-09-09T12:00:00.000Z"),
  });
  return { confirmEvidenceReview, evidenceIntake, executeCommand, openMedia, readers, service };
}
describe("Native production contract boundary", () => {
  it("enforces owner-scoped bounded HealthKit canary diagnostics", async () => {
    const current = fixture();
    const result = await current.service.read({
      request: request(), resource: "healthkit-activity-canary",
      input: { startDate: "2026-09-01", endDate: "2026-09-07" },
    });
    expect(current.readers.healthKitCanary.getActivityValidation).toHaveBeenCalledWith({
      startDate: "2026-09-01", endDate: "2026-09-07",
    });
    expect(result.resource).toBe("healthkit-activity-canary");
    await expect(current.service.read({ request: request(), resource: "healthkit-activity-canary", input: {} }))
      .rejects.toMatchObject({ status: 400 });
  });

  it("defaults Library to history/explicit membership and keeps All Exercises separate", async () => {
    const current = fixture();
    current.readers.core.getTrainingMyLibrary.mockResolvedValue(["performed", "added"]);
    current.readers.training.getLibrary.mockResolvedValue({ report: { canonicalExercises: [
      { canonicalExerciseId: "performed" }, { canonicalExerciseId: "added" }, { canonicalExerciseId: "background" },
    ] } });
    const read = (input = {}) => current.service.read({ request: request(), resource: "training-library", input });
    const mine = await read();
    expect(mine.data.myLibraryExerciseIds).toEqual(["performed", "added"]);
    expect(mine.data.report.canonicalExercises.map((exercise) => exercise.canonicalExerciseId)).toEqual(["performed", "added"]);
    expect((await read({ libraryScope: "all" })).data.report.canonicalExercises).toHaveLength(3);
    expect((await read()).data.report.canonicalExercises).toHaveLength(2);
    await expect(read({ libraryScope: "invalid" })).rejects.toMatchObject({ status: 400 });
  });

  it("fails honestly when the membership authority fails rather than returning the full catalog", async () => {
    const current = fixture();
    current.readers.core.getTrainingMyLibrary.mockRejectedValue(new Error("Synthetic membership read unavailable"));
    await expect(current.service.read({ request: request(), resource: "training-library", input: {} }))
      .rejects.toThrow("Synthetic membership read unavailable");
    current.readers.core.getTrainingMyLibrary.mockResolvedValue(null);
    await expect(current.service.read({ request: request(), resource: "training-library", input: {} }))
      .rejects.toMatchObject({ status: 404 });
  });
  it("returns an accepted command receipt when confirmation continuation throws", async () => {
    const current = fixture();
    current.confirmEvidenceReview.mockRejectedValueOnce(Object.assign(new Error("worker unavailable"), { code: "WORKER_PENDING" }));
    const result = await current.service.command({
      request: request(),
      commandType: "evidence-review.commit.v1",
      metadata: { commandId: "command-accepted", idempotencyKey: "accepted-once" },
      payload: { reviewId: "review-1" },
    });
    expect(result).toMatchObject({
      outcome: "committed",
      confirmation: { state: "processing", reviewId: "review-1", accepted: true, continuationWarning: "WORKER_PENDING" },
    });
  });
  it("publishes a Founder-production profile without provider or database implementation identity", async () => {
    const result = await fixture().service.profile({ request: request() });
    expect(result).toMatchObject({
      contractVersion: "1",
      resource: "profile",
      authority: "founder-production",
      data: { authority: { type: "founder-production", sandbox: false }, capabilities: { read: true, write: true, media: true } },
    });
    expect(JSON.stringify(result)).not.toMatch(/postgres|provider|objectKey|storage_key/i);
  });

  it("projects arbitrary Home Goal routes with the canonical Goal identity", async () => {
    const current = fixture();
    current.readers.core.getHome.mockResolvedValue({ goals: [{
      id: "goal-canonical-arbitrary-42",
      title: "An Arbitrary Current Goal",
      href: "/goals/build-lean-mass",
    }] });
    const result = await current.service.read({ request: request(), resource: "home" });
    expect(result.data.goals[0].destination).toEqual({
      id: "goal.detail",
      parameters: { goalId: "goal-canonical-arbitrary-42" },
    });
  });

  it("keeps Build 38 Home decodable during server-first future presentation additions", async () => {
    const current = fixture();
    const focus = Object.freeze({
      id: "fadogia", icon: "future-supplement-icon", color: "future-supplement-color",
      title: "Fadogia Agrestis",
    });
    current.readers.core.getHome.mockResolvedValue({
      nextBestAction: { title: "Fadogia Agrestis", icon: "pills" },
      goals: [{ id: "goal-1", title: "Build Lean Mass", icon: "future-goal-icon", color: "future-goal-color" }],
      todaysFocus: [focus], notificationOccurrences: [focus],
    });

    const legacy = await current.service.read({ request: request(), resource: "home", input: {} });
    expect(legacy.data.todaysFocus[0].icon).toBe("target");
    expect(legacy.data.todaysFocus[0].color).toBe("muted");
    expect(legacy.data.notificationOccurrences[0].icon).toBe("target");
    expect(legacy.data.nextBestAction.icon).toBe("target");
    expect(legacy.data.goals[0]).toMatchObject({ icon: "target", color: "muted" });

    const modern = await current.service.read({
      request: request(), resource: "home", input: { presentationVersion: "2" },
    });
    expect(modern.data.todaysFocus[0].icon).toBe("future-supplement-icon");
    expect(modern.data.todaysFocus[0].color).toBe("future-supplement-color");
    expect(modern.data.notificationOccurrences[0].icon).toBe("future-supplement-icon");
    expect(modern.data.nextBestAction.icon).toBe("pills");
    expect(modern.data.goals[0]).toMatchObject({ icon: "future-goal-icon", color: "future-goal-color" });
    expect(focus.icon).toBe("future-supplement-icon");
  });

  it("keeps Founder and Sandbox owner authorities fail-closed", async () => {
    const authenticate = vi.fn(async () => ({ ...principal, userId: "user_native_sandbox_alpha" }));
    await expect(fixture({ authenticate }).service.read({ request: request(), resource: "home" }))
      .rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND" });
  });

  it.each([
    ["home", {}, "core", "getHome"],
    ["goals", {}, "core", "getGoals"],
    ["nutrition", { context: "build-lean-mass" }, "progress", "getNutrition"],
    ["activity", { context: "all" }, "progress", "getActivity"],
    ["energy", { context: "all" }, "progress", "getEnergy"],
    ["dexa", { context: "all" }, "progress", "getDEXA"],
    ["photos", { context: "all" }, "photos", "getNativePhotosTimeline"],
    ["briefing-history", {}, "briefings", "listNativeHistory"],
    ["timeline", { limit: "25" }, "timeline", "getPage"],
  ])("maps %s to its canonical bounded read service", async (resource, input, group, method) => {
    const current = fixture();
    const result = await current.service.read({ request: request(), resource, input });
    expect(result.resource).toBe(resource);
    expect(current.readers[group][method]).toHaveBeenCalledTimes(1);
  });

  it("composes the canonical Energy report instead of exposing raw source collections", async () => {
    const current = fixture();
    current.readers.progress.getEnergy.mockResolvedValue({
      activityDays: [{ id: "activity-1", date: "2026-07-23", activeCalories: 897, totalCalories: 2987 }],
      dexaScans: [{ id: "dexa-1", measuredAt: "2026-07-18", restingMetabolicRate: { value: 1794 } }],
      nutritionDays: [{ id: "nutrition-1", date: "2026-07-23", totals: { calories: 2321 }, meals: [{ totals: { calories: 1 } }] }],
      timeline: { contextId: "all", selectedLabel: "All Energy", options: [] },
    });
    const result = await current.service.read({ request: request(), resource: "energy" });

    // The finished report, not the raw provider collections, is the contract.
    expect(result.data).not.toHaveProperty("activityDays");
    expect(result.data).not.toHaveProperty("nutritionDays");
    expect(result.data).not.toHaveProperty("dexaScans");
    expect(result.data.summary).toMatchObject({ averageIntake: 2321, averageExpenditure: 2691, averageBalance: -370 });
    expect(result.data.days).toEqual([
      expect.objectContaining({
        date: "2026-07-23",
        calorieIntake: 2321,
        activeCalories: 897,
        rmr: 1794,
        rmrScanId: "dexa-1",
        estimatedExpenditure: 2691,
        energyBalance: -370,
        completeness: "complete",
      }),
    ]);
    expect(Array.isArray(result.data.weeks)).toBe(true);
  });

  it("uses the revision-safe canonical Weight report and bounds newest-first history", async () => {
    const current = fixture();
    current.readers.progress.getWeight.mockResolvedValue({
      timeline: { contextId: "build-lean-mass", type: "active_goal", goalId: "goal-build", phaseId: "phase-2" },
      report: {
        current: { id: "weight-3", date: "2026-09-09", value: 170, unit: "lb", revision: 3 },
        recentWeighIns: [], rollingAverages: { threeDay: { value: 170 }, sevenDay: { value: 171 } },
        weeklyAverages: [], extrema: { goalRelevant: ["highest"] }, chart: { markers: [] },
        history: [{ id: "weight-3" }, { id: "weight-2" }, { id: "weight-1" }],
      },
    });
    const result = await current.service.read({ request: request(), resource: "weight", input: { context: "build-lean-mass", limit: "2" } });
    expect(current.readers.progress.getWeight).toHaveBeenCalledWith({ context: "build-lean-mass", currentDate: expect.any(Date) });
    expect(result.data).toMatchObject({
      current: { id: "weight-3", revision: 3 },
      context: { goalId: "goal-build", phaseId: "phase-2" },
      rollingAverages: { threeDay: { value: 170 }, sevenDay: { value: 171 } },
      page: { limit: 2, count: 2, hasMore: true },
    });
    expect(result.data.history.map((item) => item.id)).toEqual(["weight-3", "weight-2"]);
  });

  it("returns only finished Training Reporting semantics", async () => {
    const result = await fixture().service.read({ request: request(), resource: "training-reporting" });
    expect(result.data.reporting).toMatchObject({ resistance: { title: "Resistance Training" } });
    expect(result.data).not.toHaveProperty("report");
    expect(JSON.stringify(result.data)).not.toContain("resistancePerformance");
  });

  it("projects Photo media references without storage internals", async () => {
    const current = fixture();
    const mediaId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";
    current.readers.photos.getNativePhotosTimeline.mockResolvedValue({
      sessions: [{ sessionId: "session-1", revision: 2, photos: [{
        photoId: "photo-1", poseId: "front-relaxed", comparisonStatus: "comparable",
        mediaReference: `/api/private-evidence/media/${mediaId}`,
        prior: { photoId: "photo-0", mediaReference: `/api/private-evidence/media/${mediaId}` },
      }] }],
      page: { limit: 12, count: 1, hasMore: false },
    });
    const result = await current.service.read({ request: request(), resource: "photos" });
    expect(result.data.sessions[0].photos[0]).toMatchObject({
      photoId: "photo-1", poseId: "front-relaxed",
      media: { mediaId }, prior: { photoId: "photo-0", media: { mediaId } },
    });
    expect(JSON.stringify(result.data)).not.toMatch(/private-evidence|storage|spaces|objectKey/i);
  });

  it("projects Training-session screenshot media as authenticated opaque descriptors", async () => {
    const current = fixture();
    const mediaId = "01999999-9999-4999-8999-999999999999";
    current.readers.training.getSession.mockResolvedValue({
      id: "session-1",
      supportingMedia: [{ mediaReference: `media://${mediaId}` }],
    });
    const result = await current.service.read({
      request: request(), resource: "training-session", input: { sessionId: "session-1" },
    });
    expect(result.data.supportingMedia).toEqual([{
      media: { mediaId, deliveryPath: `/api/v1/native/media/${mediaId}` },
    }]);
    expect(JSON.stringify(result.data)).not.toContain("media://");
  });

  it("keeps every manifest resource routable, including current Confidence", async () => {
    const current = fixture();
    const inputs = {
      priority: { priorityId: "priority-1" },
      "training-day": { date: "2026-09-09" },
      "training-session": { sessionId: "session-1" },
      "training-exercise": { exerciseId: "curl" },
      briefing: { artifactId: "briefing-1" },
      "dexa-event": { scanId: "scan-1" },
      "photo-event": { sessionId: "photo-session-1" },
      "evidence-review": { reviewId: "review-1" },
      "operating-plan-recurring-support": { executionId: "execution_foam_roll" },
      "operating-plan-nutrition-strategy": { strategyId: "nutrition-protocol" },
      "operating-plan-training-strategy": { strategyId: "training-protocol" },
      "operating-plan-peptide-support": { protocolId: "peptide-protocol" },
      "operating-plan-protocol-domain": { protocolId: "peptide-protocol" },
      "operating-plan-supplement-support": { protocolId: "supplement-protocol" },
      "operating-plan-supplement-strategy-editor": { protocolId: "supplement-protocol" },
      "operating-plan-energy-strategy": { strategyId: "energy-protocol" },
      "operating-plan-coaching-updates": { strategyId: "coaching-protocol" },
      "healthkit-activity-canary": { startDate: "2026-09-01", endDate: "2026-09-07" },
    };
    const results = new Map();
    for (const declaration of nativeProductionContractManifest.reads) {
      const result = declaration.resource === "profile"
        ? await current.service.profile({ request: request() })
        : await current.service.read({ request: request(), resource: declaration.resource, input: inputs[declaration.resource] ?? {} });
      results.set(declaration.resource, result);
    }
    const confidence = results.get("confidence");
    expect(confidence.data).toEqual({ score: 62, band: "Moderate", movement: "held" });
    expect(results.size).toBe(nativeProductionContractManifest.reads.length);
    expect(current.readers.activeGoal.getPreview).toHaveBeenCalledTimes(2);
  });

  it("projects exact private media identities into the Native delivery contract", async () => {
    const current = fixture();
    const mediaId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";
    current.readers.completedGoal.getVisibleAbs.mockResolvedValue({ photos: { completion: { href: `/api/private-evidence/media/${mediaId}` } } });
    const completed = await current.service.read({ request: request(), resource: "completed-goal" });
    expect(completed.data.photos.completion).toEqual({ media: { mediaId, deliveryPath: `/api/v1/native/media/${mediaId}` } });
  });

  it("bounds Briefing History independently from rich artifact detail", async () => {
    const current = fixture();
    await current.service.read({ request: request(), resource: "briefing-history", input: { limit: "12", cursor: "briefing-prior" } });
    expect(current.readers.briefings.listNativeHistory).toHaveBeenCalledWith({ limit: 12, cursor: "briefing-prior" });
    await expect(current.service.read({ request: request(), resource: "briefing-history", input: { limit: "51" } }))
      .rejects.toMatchObject({ status: 400, code: "CONTRACT_VALIDATION_FAILED" });
  });

  it("requires canonical identities for detail reads and bounds history limits", async () => {
    const current = fixture();
    await expect(current.service.read({ request: request(), resource: "training-session", input: {} }))
      .rejects.toMatchObject({ status: 400, code: "CONTRACT_VALIDATION_FAILED" });
    await expect(current.service.read({ request: request(), resource: "timeline", input: { limit: "201" } }))
      .rejects.toMatchObject({ status: 400, code: "CONTRACT_VALIDATION_FAILED" });
    await expect(current.service.read({ request: request(), resource: "weight", input: { limit: "366" } }))
      .rejects.toMatchObject({ status: 400, code: "CONTRACT_VALIDATION_FAILED" });
    await expect(current.service.read({ request: request(), resource: "photos", input: { limit: "51" } }))
      .rejects.toMatchObject({ status: 400, code: "CONTRACT_VALIDATION_FAILED" });
  });

  it("passes an explicit canonical Priority occurrence date and rejects an invalid one", async () => {
    const current = fixture();
    await current.service.read({
      request: request(), resource: "priority",
      input: { priorityId: "priority-1", occurrenceDate: "2026-09-08" },
    });
    expect(current.readers.priorities.getPriorityDetail).toHaveBeenCalledWith(
      "priority-1", { occurrenceDate: "2026-09-08" },
    );
    await expect(current.service.read({
      request: request(), resource: "priority",
      input: { priorityId: "priority-1", occurrenceDate: "tonight" },
    })).rejects.toMatchObject({ status: 400, code: "CONTRACT_VALIDATION_FAILED" });
  });

  it("delegates idempotent writes to the existing canonical command service", async () => {
    const current = fixture();
    const result = await current.service.command({
      request: request(),
      commandType: "priority.complete.v1",
      metadata: { idempotencyKey: "native-priority-20260909" },
      payload: { priorityId: "priority-1", occurrenceDate: "2026-09-09" },
    });
    expect(result.outcome).toBe("committed");
    expect(current.executeCommand).toHaveBeenCalledWith(expect.objectContaining({ principal, commandType: "priority.complete.v1" }));
  });

  it("rejects legacy or inert write aliases at the Native boundary", async () => {
    const current = fixture();
    await expect(current.service.command({
      request: request(), commandType: "activity-day.sync.v1",
      metadata: { idempotencyKey: "legacy-sync" }, payload: {},
    })).rejects.toMatchObject({ status: 400, code: "NATIVE_COMMAND_UNAVAILABLE" });
    expect(current.executeCommand).not.toHaveBeenCalled();
  });

  it("authorizes the bounded V1 HealthKit observation command without enabling legacy Activity sync", async () => {
    const current = fixture();
    await current.service.command({
      request: request(),
      commandType: "healthkit.observations.ingest.v1",
      metadata: { idempotencyKey: "healthkit-batch-one" },
      payload: { batchId: "batch-one", observations: [{ observationType: "workout" }] },
    });
    expect(current.executeCommand).toHaveBeenCalledWith(expect.objectContaining({
      principal,
      commandType: "healthkit.observations.ingest.v1",
    }));
  });

  it("starts the real Evidence Review confirmation lifecycle after the canonical receipt commits", async () => {
    const current = fixture();
    current.executeCommand.mockResolvedValue({ outcome: "committed", receipt: { commandId: "command-7" } });
    const result = await current.service.command({
      request: request(), commandType: "evidence-review.commit.v1",
      metadata: { idempotencyKey: "confirm-review-1", expectedVersion: "3" },
      payload: { reviewId: "review-1" },
    });
    expect(current.confirmEvidenceReview).toHaveBeenCalledWith({
      principal, reviewId: "review-1", commandId: "command-7",
    });
    expect(result.confirmation).toEqual({ state: "processing", reviewId: "review-1" });
  });

  it("rejects a production-shaped Nutrition conflict before accepting a command receipt", async () => {
    const current = fixture();
    current.readers.evidenceReview.getReview.mockResolvedValue({ review: {
      id: "review-1", evidenceTypes: ["nutrition"],
      interpretedEvidence: { evidence_objects: [{
        id: "nutrition_2026-09-12", evidence_type: "nutrition",
        daily_totals: { calories: 900, protein_g: 40 },
        meals: [{ name: "Dinner", totals: { calories: 600, protein_g: 25 } }],
        metadata: { daily_totals_reconciliation: {
          status: "needs_review",
          conflicting_fields: ["calories", "protein_g"],
        } },
      }] },
    } });

    await expect(current.service.command({
      request: request(), commandType: "evidence-review.commit.v1",
      metadata: { idempotencyKey: "nutrition-conflict", expectedVersion: "9" },
      payload: { reviewId: "review-1" },
    })).rejects.toMatchObject({
      status: 400,
      code: "NUTRITION_DAILY_TOTALS_CONFLICT",
      fieldErrors: expect.arrayContaining([
        expect.objectContaining({ field: "dailyTotals.calories" }),
      ]),
    });
    expect(current.executeCommand).not.toHaveBeenCalled();
    expect(current.confirmEvidenceReview).not.toHaveBeenCalled();
  });

  it("allows versioned photo dismissal without enabling photo confirmation", async () => {
    const current = fixture();
    await current.service.command({
      request: request(), commandType: "evidence-review.dispose.v1",
      metadata: { idempotencyKey: "dismiss-review-1", expectedVersion: "3" },
      payload: { reviewId: "review-1", disposition: "discarded" },
    });
    expect(current.executeCommand).toHaveBeenCalledWith(expect.objectContaining({
      commandType: "evidence-review.dispose.v1",
      metadata: expect.objectContaining({ expectedVersion: "3" }),
      payload: { reviewId: "review-1", disposition: "discarded" },
    }));

    current.readers.evidenceReview.getReview.mockResolvedValue({
      review: { id: "review-photo", evidenceTypes: ["progress_photo"] },
    });
    await current.service.command({
      request: request(), commandType: "evidence-review.dispose.v1",
      metadata: { idempotencyKey: "dismiss-photo", expectedVersion: "1" },
      payload: { reviewId: "review-photo", disposition: "discarded" },
    });
    await expect(current.service.command({
      request: request(), commandType: "evidence-review.commit.v1",
      metadata: { idempotencyKey: "confirm-photo", expectedVersion: "1" },
      payload: { reviewId: "review-photo" },
    })).rejects.toMatchObject({ status: 400, code: "NATIVE_EVIDENCE_REVIEW_UNAVAILABLE" });
  });

  it("acknowledges a structured Training log at its direct durable canonical boundary", async () => {
    const current = fixture();
    current.executeCommand.mockResolvedValue({
      outcome: "committed",
      receipt: { commandId: "command-training", result: {
        status: "durable", canonicalId: "training|authoritative|training_logger_draft_session-one",
        trainingSessionDurable: true,
        stageDurations: { validationAndPackageMs: 1, boundedCanonicalCommitMs: 2, durableReadbackMs: 0.2 },
      } },
    });
    const result = await current.service.command({
      request: request(), commandType: "training-session.commit.v1",
      metadata: { idempotencyKey: "training-one" },
      payload: { sessionId: "session-one", localDate: "2026-09-09", exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185 }] }] },
    });
    expect(current.confirmEvidenceReview).not.toHaveBeenCalled();
    expect(result.confirmation).toEqual({
      state: "confirmed", accepted: true, trainingSessionDurable: true,
      canonicalId: "training|authoritative|training_logger_draft_session-one",
    });
  });

  it.each(["failed", "pending"])("does not acknowledge a logged workout when canonical confirmation is %s", async (state) => {
    const current = fixture();
    current.executeCommand.mockResolvedValue({ outcome: "committed", receipt: { commandId: "command-training", result: { reviewId: "review-training" } } });
    if (state === "failed") current.confirmEvidenceReview.mockRejectedValue(new Error("canonical persistence failed"));
    else current.confirmEvidenceReview.mockResolvedValue({ state: "processing", accepted: true });
    await expect(current.service.command({ request: request(), commandType: "training-session.commit.v1", metadata: { idempotencyKey: "same-workout" }, payload: { sessionId: "session-one", localDate: "2026-09-09", exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185 }] }] } }))
      .rejects.toMatchObject({ status: 503, code: "TRAINING_SESSION_NOT_DURABLE" });
  });

  it("authorizes asynchronous evidence intake creation and status through the same owner boundary", async () => {
    const current = fixture();
    await expect(current.service.acceptEvidenceIntake({ request: request(), input: { submissionIdentity: "id" } }))
      .resolves.toMatchObject({ intakeId: "intake-1", status: "processing" });
    await expect(current.service.evidenceIntakeStatus({ request: request(), intakeId: "intake-1" }))
      .resolves.toMatchObject({ reviewId: "review-1", status: "ready" });
  });

  it("authorizes opaque media IDs without accepting storage paths", async () => {
    const current = fixture();
    await current.service.media({ request: request(), mediaId: "media-photo-1" });
    expect(current.openMedia).toHaveBeenCalledWith({ principal, objectId: "media-photo-1" });
  });

  it("documents every read and write under bearer, owner-scoped production authority", () => {
    expect(nativeProductionContractManifest.reads.length).toBeGreaterThanOrEqual(28);
    expect(nativeProductionContractManifest.reads.every((item) => item.auth === "founder-device-bearer" && item.authority === "founder-production")).toBe(true);
    expect(nativeProductionContractManifest.writes.every((item) => item.idempotency.includes("Idempotency-Key"))).toBe(true);
    expect(nativeProductionContractManifest.writes.map((item) => item.commandType)).toEqual([
      "weight.submit.v1", "check-in.submit.v1", "priority.complete.v1",
      "training-session.commit.v1", "nutrition-day.upsert.v1", "activity-day.upsert.v1",
      "healthkit.observations.ingest.v1",
      "dexa-review.measurements.v1", "evidence-review.commit.v1", "evidence-review.dispose.v1",
      "operating-plan.recurring-support.save.v1", "operating-plan.nutrition-strategy.save.v1",
      "training-catalog.my-library.add.v1", "training-catalog.exercise.create.v1",
      "operating-plan.training-strategy.save.v1",
      "operating-plan.peptide-support.save.v1",
      "operating-plan.supplement-support.save.v1",
      "operating-plan.supplement-strategy.save.v1",
      "operating-plan.supplement-lifecycle.change.v1",
      "operating-plan.coaching-updates.save.v1",
    ]);
    expect(nativeProductionContractManifest.healthKitIngestion).toMatchObject({
      contractVersion: "healthkit-ingestion-v1",
      maximumBatchSize: 100,
      observationTypes: ["activity_summary", "workout", "quantity_sample"],
      ingestionPurposes: ["operational", "validation_only"],
      defaultIngestionPurpose: "operational",
      queryCursor: expect.stringMatching(/device-owned/),
      evidenceEligibility: "not assessed by ingestion",
    });
    expect(JSON.stringify(nativeProductionContractManifest)).not.toMatch(/activity-day\.sync/);
    expect(JSON.stringify(nativeProductionContractManifest)).not.toMatch(/storage_key|Spaces|databaseName|provider-authoritative/);
  });
});

function request() {
  return new Request("https://physiqueos.example/api/v1/native/read/home", { headers: { authorization: `Bearer ${"x".repeat(43)}` } });
}
