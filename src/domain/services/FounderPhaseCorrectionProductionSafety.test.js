import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createFounderBuildLeanMassPhaseRepairPlan,
  isFounderBuildLeanMassGoal,
} from "./FounderPhaseCorrectionService";
import { createFullFounderMemoryProbe } from "../../testSupport/fullFounderMemoryProbe";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Founder phase correction production safety", () => {
  it("builds the deterministic repair plan without mutating Founder storage", () => {
    const before = fs.readFileSync(storePath);
    const memory = createFullFounderMemoryProbe({
      label: "FounderPhaseCorrectionProductionSafety",
      logicalStoreBytes: before.length,
      maxHeapUsedBytes: 256 * 1024 * 1024,
      maxRssBytes: 384 * 1024 * 1024,
    });
    const store = JSON.parse(before.toString("utf8"));
    memory.checkpoint("production_store_parsed");
    const goal = store.goals.find(isFounderBuildLeanMassGoal);
    const plan = createFounderBuildLeanMassPhaseRepairPlan(goal);
    memory.checkpoint("bounded_goal_repair_created");

    expect(plan.persistenceAuthorized).toBe(false);
    expect(plan.candidate.phases.find((phase) => phase.name === "Establish Maintenance")).toMatchObject({
      startedAt: "2026-07-19",
      plannedReviewAt: "2026-08-15",
      status: "active",
      completedAt: null,
    });
    expect(plan.candidate.phases.find((phase) => phase.name === "Lean Mass Build")).toMatchObject({
      status: "planned",
      startedAt: null,
      projectedNextPhaseStart: "2026-08-16",
    });
    expect(fs.readFileSync(storePath).equals(before)).toBe(true);
    memory.finish({ testOwnedFullStoreParses: 1, testOwnedFullStoreClones: 0,
      testOwnedFullStoreSerializations: 0, fullStoreDeepFreezes: 0,
      boundedGoalClones: 1, boundedGoalDeepFreezes: 1,
      temporaryStoreInstances: 0 });

    console.info(`FOUNDER_PHASE_REPAIR_BEFORE=${plan.preconditions.beforeFingerprint}`);
    console.info(`FOUNDER_PHASE_REPAIR_AFTER=${plan.afterFingerprint}`);
    console.info(`FOUNDER_PHASE_REPAIR_IDEMPOTENCY=${plan.idempotencyKey}`);
  }, 60000);
});
