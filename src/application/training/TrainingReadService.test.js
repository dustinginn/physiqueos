import { describe, expect, it } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createTrainingReadService } from "./TrainingReadService.js";

const principal = createAuthenticationPrincipal({ userId: "owner-one", deviceId: "device-one", sessionId: "session-one" });
const session = (id, observedAt, quality = {}) => ({ canonicalId: id, quality, payload: { evidence_type: "training", observed_at: observedAt, metadata: { activity_type: "Resistance Training" }, exercises: [{ name: "Curl" }] } });

describe("training shared-client boundary", () => {
  it("returns confirmed canonical history/detail in recency order and suppresses superseded records", async () => {
    const records = [session("older", "2026-08-09T17:00:00Z"), session("newer", "2026-08-10T17:00:00Z"), session("superseded", "2026-08-11T17:00:00Z", { status: "superseded" })];
    const service = createTrainingReadService({ repositories: { canonicalEvidence: { listCanonicalEvidenceObjects: async (userId) => userId === "owner-one" ? records : [] } } });
    expect((await service.listHistory({ principal })).map((item) => item.id)).toEqual(["newer", "older"]);
    expect(await service.getSession({ principal, sessionId: "newer" })).toMatchObject({ id: "newer", exerciseCount: 1, exercises: [{ name: "Curl" }] });
    expect(await service.getSession({ principal, sessionId: "missing" })).toBeNull();
  });

  it("requires ownership context for history and exercise search", async () => {
    const service = createTrainingReadService({ repositories: { canonicalEvidence: { listCanonicalEvidenceObjects: async () => [] } } });
    await expect(service.listHistory()).rejects.toMatchObject({ status: 401 });
    await expect(service.getExerciseLibrary({ query: "curl" })).rejects.toMatchObject({ status: 401 });
  });

  it("exposes categories, canonical exercise detail, search, and recent exercise identity", async () => {
    const records = [{ canonicalId: "session-one", payload: { evidence_type: "training", observed_at: "2026-08-10T17:00:00Z", exercises: [{ canonicalExerciseId: "ez_bar_curl", canonicalExerciseName: "EZ Bar Curls" }] } }];
    const service = createTrainingReadService({ repositories: { canonicalEvidence: { listCanonicalEvidenceObjects: async () => records } } });
    expect(await service.listCategories({ principal })).toContain("Arms");
    expect(await service.getExercise({ principal, exerciseId: "ez_bar_curl" })).toMatchObject({ name: "EZ Bar Curls", bodyRegion: "Arms", movementPattern: "Elbow Flexion" });
    expect((await service.getExerciseLibrary({ principal, query: "EZ Bar" }))[0]).toMatchObject({ id: "ez_bar_curl", bodyRegion: "Arms" });
    expect(await service.listRecentExercises({ principal })).toEqual([{ id: "ez_bar_curl", name: "EZ Bar Curls", observedAt: "2026-08-10T17:00:00Z" }]);
  });
});
