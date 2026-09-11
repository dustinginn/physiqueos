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
      getLog: call({ reviews: [] }),
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
      getLibrary: call({ report: {} }),
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
    photos: { getNativePhotosTimeline: call({ sessions: [], page: { limit: 12, count: 0, hasMore: false } }) },
    briefings: { listNativeHistory: call({ items: [], page: { limit: 20, hasMore: false, nextCursor: null } }), getNativeArtifact: call({ artifact: { artifactId: "briefing-1" } }), getDexaArtifact: call({ artifact: { id: "dexa-event-1" } }) },
    photoEvents: { getPhotoEvent: call({ artifact: { id: "photo-event-1" } }) },
    evidenceReview: { getReview: call({ review: { id: "review-1" } }) },
    timeline: { getPage: call({ items: [], hasMore: false }) },
  };
  const executeCommand = vi.fn(async (input) => ({ outcome: "committed", commandType: input.commandType }));
  const openMedia = vi.fn(async () => ({ url: "https://private.invalid/read" }));
  const service = createNativeProductionContractService({
    authenticate: overrides.authenticate ?? vi.fn(async () => principal),
    ownerUserId: OWNER,
    readers,
    executeCommand,
    openMedia,
    now: () => new Date("2026-09-09T12:00:00.000Z"),
  });
  return { executeCommand, openMedia, readers, service };
}
describe("Native production contract boundary", () => {
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

  it("authorizes opaque media IDs without accepting storage paths", async () => {
    const current = fixture();
    await current.service.media({ request: request(), mediaId: "media-photo-1" });
    expect(current.openMedia).toHaveBeenCalledWith({ principal, objectId: "media-photo-1" });
  });

  it("documents every read and write under bearer, owner-scoped production authority", () => {
    expect(nativeProductionContractManifest.reads.length).toBeGreaterThanOrEqual(28);
    expect(nativeProductionContractManifest.reads.every((item) => item.auth === "founder-device-bearer" && item.authority === "founder-production")).toBe(true);
    expect(nativeProductionContractManifest.writes.every((item) => item.idempotency.includes("Idempotency-Key"))).toBe(true);
    expect(JSON.stringify(nativeProductionContractManifest)).not.toMatch(/storage_key|Spaces|databaseName|provider-authoritative/);
  });
});

function request() {
  return new Request("https://physiqueos.example/api/v1/native/read/home", { headers: { authorization: `Bearer ${"x".repeat(43)}` } });
}
