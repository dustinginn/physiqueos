import { describe, expect, it } from "vitest";
import { createV3EvidenceUniverse, V3_CARRY_FORWARD_BRIEFING_LIMIT } from "./V3EvidenceUniverse.js";

const goal = { id: "goal-a" };
const phase = { id: "phase-a", startedAt: "2026-08-01" };
const briefing = (id, endDate, overrides = {}) => ({
  id, cadence: "weekly", goalId: "goal-a", phaseId: "phase-a", evidenceWindow: { endDate }, ...overrides,
});

describe("shared V3 evidence universe", () => {
  it("requires an evidence cutoff", () => {
    expect(() => createV3EvidenceUniverse({ store: {}, goal, phase })).toThrow(/cutoff/);
  });

  it("keeps only cutoff-bounded, goal- and phase-owned briefings, newest first, up to the limit", () => {
    const store = { dailyBriefings: [
      briefing("b1", "2026-08-10"), briefing("b2", "2026-08-17"), briefing("b3", "2026-08-24"),
      briefing("b4", "2026-08-31"), briefing("future", "2026-09-30"),
      briefing("other-goal", "2026-08-30", { goalId: "goal-z" }),
      briefing("other-phase", "2026-08-30", { phaseId: "phase-z" }),
    ] };
    const universe = createV3EvidenceUniverse({ store, goal, phase, evidenceCutoff: "2026-09-05T00:00:00.000Z" });
    expect(universe.dailyBriefings.map((item) => item.id)).toEqual(["b4", "b3", "b2"]);
    expect(universe.dailyBriefings).toHaveLength(V3_CARRY_FORWARD_BRIEFING_LIMIT);
  });

  it("keeps the newest briefings per cadence so newer Events cannot crowd out the latest Weekly", () => {
    const store = { dailyBriefings: [
      briefing("weekly-old", "2026-08-10"),
      ...["e1", "e2", "e3", "e4"].map((id, index) => briefing(id, `2026-08-2${index}`, { cadence: "event" })),
    ] };
    const universe = createV3EvidenceUniverse({ store, goal, phase, evidenceCutoff: "2026-09-05T00:00:00.000Z" });
    expect(universe.dailyBriefings.map((item) => item.id)).toContain("weekly-old");
  });

  it("reads the read-only namespace a bounded publisher supplies and de-duplicates by id", () => {
    const store = {
      protocols: [{ id: "p1" }],
      v3ReadOnlyEvidence: { protocols: [{ id: "p1" }, { id: "p2" }], protocolVersions: [{ id: "v1" }], weightEntries: [{ id: "w1" }] },
    };
    const universe = createV3EvidenceUniverse({ store, goal, phase, evidenceCutoff: "2026-09-05T00:00:00.000Z" });
    expect(universe.protocols.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(universe.protocolVersions).toHaveLength(1);
    expect(universe.weightEntries).toHaveLength(1);
  });

  it("includes only training evidence within the phase and before the cutoff, and no other evidence types", () => {
    const training = (id, date, type = "training") => ({ id, payload: { evidence_type: type, observed_at: date } });
    const store = { canonicalEvidenceObjects: [
      training("t-in", "2026-08-20"), training("t-early", "2026-07-01"),
      training("t-late", "2026-09-30"), training("n-1", "2026-08-20", "nutrition"),
    ] };
    const universe = createV3EvidenceUniverse({ store, goal, phase, evidenceCutoff: "2026-09-05T00:00:00.000Z" });
    expect(universe.canonicalEvidenceObjects.map((item) => item.id)).toEqual(["t-in"]);
  });

  it("does not expose collections outside the explicit whitelist", () => {
    const universe = createV3EvidenceUniverse({
      store: { secretCollection: [{ id: "x" }], users: [{ id: "u" }] }, goal, phase, evidenceCutoff: "2026-09-05T00:00:00.000Z",
    });
    expect(universe).not.toHaveProperty("secretCollection");
    expect(universe).not.toHaveProperty("users");
  });
});
