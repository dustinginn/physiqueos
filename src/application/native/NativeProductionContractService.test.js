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
    },
    activeGoal: { getPreview: call({ goal: { id: "goal-build" }, confidence: { score: 62, movement: "no_meaningful_change" } }) },
    completedGoal: { getVisibleAbs: call({ goal: { id: "goal-visible-abs" } }) },
    priorities: { getPriorityDetail: call({ id: "priority-1" }) },
    weight: { getCurrentWeight: call({ canonicalId: "weight_2026_09_09", revision: 1 }) },
    training: {
      getLanding: call({ report: {} }), getReporting: call({ report: {} }), getLibrary: call({ report: {} }),
      getDay: call({ date: "2026-09-09" }), getSession: call({ id: "session-1" }), getExercise: call({ id: "curl" }),
    },
    progress: { getNutrition: call({ report: {} }), getActivity: call({ report: {} }), getEnergy: call({ timeline: {} }), getDEXA: call({ report: {} }) },
    photos: { getPhotosTimeline: call({ report: {} }) },
    briefings: { listHistory: call({ items: [] }), getArtifact: call({ artifact: { id: "briefing-1" } }), getDexaArtifact: call({ artifact: { id: "dexa-event-1" } }) },
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
    ["photos", { context: "all" }, "photos", "getPhotosTimeline"],
    ["briefing-history", {}, "briefings", "listHistory"],
    ["timeline", { limit: "25" }, "timeline", "getPage"],
  ])("maps %s to its canonical bounded read service", async (resource, input, group, method) => {
    const current = fixture();
    const result = await current.service.read({ request: request(), resource, input });
    expect(result.resource).toBe(resource);
    expect(current.readers[group][method]).toHaveBeenCalledTimes(1);
  });

  it("requires canonical identities for detail reads and bounds history limits", async () => {
    const current = fixture();
    await expect(current.service.read({ request: request(), resource: "training-session", input: {} }))
      .rejects.toMatchObject({ status: 400, code: "CONTRACT_VALIDATION_FAILED" });
    await expect(current.service.read({ request: request(), resource: "timeline", input: { limit: "201" } }))
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
