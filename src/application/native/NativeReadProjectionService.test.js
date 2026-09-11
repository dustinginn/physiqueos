import { describe, expect, it } from "vitest";
import {
  projectNativePhotosRead,
  projectNativeTrainingReportingRead,
  projectNativeWeightRead,
} from "./NativeReadProjectionService.js";

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
        prior: { sessionId: "session-prior", photoId: "photo-prior", intendedCaptureDate: "2026-07-03" },
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(/sessionFingerprint|hiddenProvenance|storage|path|provider/i);
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
