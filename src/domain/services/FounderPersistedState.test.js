import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const store = JSON.parse(fs.readFileSync(path.join(process.cwd(), "private", "founder", "runtime-store.json"), "utf8"));
const canonical = store.canonicalEvidenceObjects ?? [];

describe("Founder persisted-state regressions", () => {
  it("keeps July 11 as three active poses and one provenance-only retry", () => {
    const session = canonical.find((item) => item.evidence_type === "photo_session" && item.canonicalId === "photo_session_user_founder_001_2026-07-11");
    const active = session.payload.photos.filter((photo) => photo.status === "active");
    expect(active.map((photo) => `${photo.view}-${photo.pose}`).sort()).toEqual(["back-flexed", "back-relaxed", "front-relaxed"]);
    expect(session.payload.photos.filter((photo) => photo.status === "duplicate")).toHaveLength(1);
    expect(session.payload.completionState).toBe("complete");
    expect(Object.fromEntries(["morning", "fasted", "postWorkout", "pump"].map((key) => [key, session.payload.sessionConditions[key]?.value]))).toEqual({ morning: false, fasted: false, postWorkout: true, pump: "unknown" });
  });

  it("keeps July 4 strength truth at two exercises, eight sets, and 4,400 lb", () => {
    const sessions = canonical.filter((item) => item.evidence_type === "training" && item.quality?.status !== "superseded" && String(item.lastObservedAt).startsWith("2026-07-04") && /traditional strength/i.test(item.payload?.metadata?.activity_type ?? ""));
    expect(sessions).toHaveLength(1);
    const exercises = sessions[0].payload.exercises;
    expect(exercises.map((item) => item.name)).toEqual(["Spider Curl", "EZ Bar Curl"]);
    expect(exercises.some((item) => item.name === "Reps")).toBe(false);
    expect(exercises.flatMap((item) => item.sets)).toHaveLength(8);
    expect(exercises.flatMap((item) => item.sets).reduce((sum, set) => sum + (Number(set.volume) || Number(set.reps) * Number(set.weight)), 0)).toBe(4400);
  });
});
