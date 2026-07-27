import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTROLLED_GOAL_ID, CONTROLLED_PHASE_ID,
  runControlledReconciliation,
} from "./piGoalConfidenceControlledReconciliation";
import { createFounderRuntimeSemanticDigest } from "../src/domain/services/FounderRuntimeSemanticDigest";
import { createHash } from "node:crypto";

const dirs = [];
afterEach(() => dirs.splice(0).forEach((dir) =>
  fs.rmSync(dir, { recursive: true, force: true })));

describe("controlled PI confidence reconciliation wrapper", () => {
  it("is dry-run by default and leaves the runtime byte-identical", async () => {
    const fixture = setup();
    const before = fs.readFileSync(fixture.file);
    const output = await runControlledReconciliation(fixture.options);
    expect(output.mode).toBe("dry_run");
    expect(output.result.status).toBe("published_reconciliation");
    expect(fs.readFileSync(fixture.file)).toEqual(before);
    expect(output.publicationCommand.operation).toBe("publish_initial");
  });

  it("rejects baseline or scope mismatch before publication", async () => {
    const fixture = setup();
    await expect(runControlledReconciliation({
      ...fixture.options, expectedRevision: 99,
    })).rejects.toThrow("revision guard");
    await expect(runControlledReconciliation({
      ...fixture.options, goalId: "wrong",
    })).rejects.toThrow("goal ID guard");
  });
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-controlled-"));
  dirs.push(dir);
  const file = path.join(dir, "runtime.json");
  const store = {
    version: "test", revision: 7, lastCommitId: "before",
    updatedAt: "2026-07-26T00:00:00.000Z",
    goals: [{
      id: CONTROLLED_GOAL_ID, status: "active", primary: true,
      openingApproach: { value: "calibration" },
      phases: [{ id: CONTROLLED_PHASE_ID, status: "active",
        goalId: CONTROLLED_GOAL_ID }],
    }],
    dailyBriefings: [{
      id: "weekly_briefing_fixture",
      briefing: { weeklyNarrative: { context: { pi: {
        limitations: ["paired_coverage_partial"],
        observations: [
          ...["a", "b", "c"].map((id) => ({
            id, domain: "training", status: "improving",
            subject: { type: "training_category" },
            evidenceWindow: { endDate: "2026-07-25" },
          })),
          { id: "p", domain: "photos", status: "stable",
            evidenceWindow: { endDate: "2026-07-25" } },
          { id: "w1", domain: "weight", direction: "rising",
            evidenceWindow: { endDate: "2026-07-25" } },
          { id: "w2", domain: "weight", direction: "falling",
            evidenceWindow: { endDate: "2026-07-25" } },
        ],
      } } } },
    }],
    goalConfidenceSnapshots: [], goalConfidenceHistory: [],
    goalConfidenceContinuitySeeds: [],
  };
  fs.writeFileSync(file, JSON.stringify(store));
  const raw = fs.readFileSync(file);
  const hash = createHash("sha256").update(raw).digest("hex").toUpperCase();
  return { file, options: {
    filePath: file, execute: false,
    goalId: CONTROLLED_GOAL_ID, phaseId: CONTROLLED_PHASE_ID,
    operatingState: "calibration", expectedHash: hash,
    expectedSemanticDigest: createFounderRuntimeSemanticDigest(store),
    expectedRevision: 7, legacyContinuityScore: 44,
    legacySourceModel: "overall_goal_confidence_v1",
    legacySourceTimestamp: "2026-07-25T00:00:00.000Z",
    legacySourceFingerprint: "fixture_44",
    triggerId: "fixture_reconciliation",
    publicationReason: "establish_initial_pi_v3_goal_confidence_series",
    generatedAt: "2026-07-26T17:00:00.000Z",
  } };
}
