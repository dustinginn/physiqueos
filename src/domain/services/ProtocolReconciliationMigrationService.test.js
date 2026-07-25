import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyProtocolReconciliationPlan,
  buildProtocolReconciliationPlan,
  createProtocolReconciliationMigrationService,
  fingerprintProtocolReconciliationPlan,
  ProtocolReconciliationMigrationError,
  validateProtocolReconciliationPostState,
} from "./ProtocolReconciliationMigrationService";
import { createDailyFocusService } from "./DailyFocusService";
import {
  buildOperatingPlan,
  deriveAuthoritativeRecurringExecutionItems,
} from "../../screens/OperatingPlanScreen";
import { resolveActiveOperatingPlanEnergyStrategy } from "./OperatingPlanEnergyStrategyService";

const temporaryDirectories = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const productionPath = resolvePreMigrationFixture();
const load = () => JSON.parse(fs.readFileSync(productionPath, "utf8"));

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("protocol reconciliation plan", () => {
  it("pairs every planned record through transition provenance, never display name", () => {
    const plan = buildProtocolReconciliationPlan(load());
    expect(plan.pairs).toHaveLength(15);
    expect(new Set(plan.pairs.map((item) => item.plannedProtocolId)).size).toBe(15);
    expect(plan.pairs.every((item) => item.semanticIdentityKey.includes(item.category))).toBe(true);
  });

  it("blocks ambiguous provenance pairing", () => {
    const store = load();
    const duplicate = structuredClone(store.protocols.find((item) => item.status === "planned"));
    duplicate.id = `${duplicate.id}_duplicate`;
    store.protocols.push(duplicate);
    expect(() => buildProtocolReconciliationPlan(store)).toThrowError(
      expect.objectContaining({ code: "UNEXPECTED_PROTOCOL_TOPOLOGY" })
    );
  });

  it("blocks missing goals, phases, and contradictory dispositions", () => {
    const missing = load();
    missing.goals.find((item) => item.primary).phases = [];
    expect(() => buildProtocolReconciliationPlan(missing)).toThrowError(
      expect.objectContaining({ code: "MISSING_PROTECTED_REFERENCE" })
    );
    const contradiction = load();
    contradiction.protocols.find((item) => item.status === "planned").disposition = "replace";
    expect(() => buildProtocolReconciliationPlan(contradiction)).toThrowError(
      expect.objectContaining({ code: "DISPOSITION_CONTRADICTION" })
    );
  });

  it("maps keep to retention and update to promotion", () => {
    const plan = buildProtocolReconciliationPlan(load());
    expect(plan.pairs.find((item) => item.legacyProtocolId === "protocol_retatrutide_founder")).toMatchObject({
      disposition: "keep",
      action: "retain",
      authoritativeProtocolId: "protocol_retatrutide_founder",
    });
    expect(plan.pairs.find((item) => item.legacyProtocolId === "protocol_nutrition_founder_cut")).toMatchObject({
      disposition: "update",
      action: "promote",
    });
  });
});

describe("protocol reconciliation candidate", () => {
  it("establishes one authoritative active protocol per branch and preserves history", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate, report } = applyProtocolReconciliationPlan(before, plan, {
      migratedAt: "2026-07-23T16:00:00.000Z",
    });
    expect(validateProtocolReconciliationPostState(before, candidate, plan).valid).toBe(true);
    expect(candidate.protocols.filter((item) => item.status === "active")).toHaveLength(15);
    expect(candidate.protocols.filter((item) => item.status === "planned")).toHaveLength(0);
    expect(report.retainedProtocolIds).toEqual(expect.arrayContaining([
      "protocol_retatrutide_founder",
      "protocol_tesamorelin_founder",
      "protocol_training_founder_maintenance",
    ]));
    expect(candidate.protocols.find((item) => item.id === "protocol_nutrition_founder_cut")).toMatchObject({
      status: "archived",
      lifecycle: { status: "superseded" },
    });
  });

  it("moves Energy and Nutrition to persisted maintenance calibration without inventing calories", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    expect(candidate.energyStrategyLinks).toMatchObject({
      goalId: plan.targetGoalId,
      selectedPace: "maintenance_calibration",
      strategyMode: "Maintenance Calibration",
    });
    expect(candidate.nutritionContext.estimatedDailyCaloricIntake).toBeNull();
    expect(candidate.nutritionContext.calibrationStrategy).toMatchObject({
      proteinTarget: 167,
      calorieStrategy: "increase_gradually",
    });
  });

  it("preserves Retatrutide taper and Tesamorelin while cancelling redundant planned copies", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    const reta = candidate.protocols.find((item) => item.id === "protocol_retatrutide_founder");
    expect(reta.status).toBe("active");
    expect(reta.doseHistory.find((item) => item.startDate === "2026-07-23")).toMatchObject({ dose: 1.5, doseUnit: "mg" });
    expect(candidate.protocols.filter((item) => /retatrutide/i.test(item.name) && item.status === "active")).toHaveLength(1);
    expect(candidate.protocols.filter((item) => /tesamorelin/i.test(item.name) && item.status === "active")).toHaveLength(1);
    expect(candidate.reminders.find((item) => item.id === "reminder_retatrutide").linkedEntityId).toBe(reta.id);
  });

  it("retains exactly one active record for every supplement", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    expect(candidate.protocols.filter((item) => item.category === "supplement" && item.status === "active")).toHaveLength(4);
    expect(candidate.protocols.filter((item) => item.category === "supplement" && item.status === "planned")).toHaveLength(0);
  });

  it("canonicalizes Foam Rolling at its persisted time and preserves execution history", () => {
    const before = load();
    const originalExecution = structuredClone(before.executionItems.find((item) => item.id === "execution_foam_roll"));
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    const foam = candidate.protocols.find((item) => item.id === plan.foamRolling.canonicalProtocolId);
    expect(foam).toMatchObject({
      name: "Foam Rolling",
      status: "active",
      ownership: "user_created",
      schedule: { type: "daily", timeOfDay: "17:00" },
      manualCompletion: true,
    });
    const execution = candidate.executionItems.find((item) => item.id === "execution_foam_roll");
    expect(execution.completionHistory).toEqual(originalExecution.completionHistory);
    expect(execution.linkedProtocolId).toBe(foam.id);
    expect(candidate.reminders.find((item) => item.id === "reminder_foam_roll_daily").linkedEntityId).toBe(foam.id);
    expect(candidate.executionItems.filter((item) => item.active !== false)).toHaveLength(11);
    expect(candidate.reminders.filter((item) => item.active !== false && !item.status)).toHaveLength(10);
    expect(candidate.reminders.filter((item) =>
      /_commitment_(weight|dexa|photos|recovery)_/.test(item.id) && item.active !== false
    )).toHaveLength(0);
  });

  it("rebuilds Operating Plan from active authoritative records only", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    const sections = buildOperatingPlan({
      energyStrategy: resolveActiveOperatingPlanEnergyStrategy({
        goals: candidate.goals,
        protocols: candidate.protocols,
        userId: candidate.user.id,
      }),
      executionItems: candidate.executionItems,
      nutritionContext: candidate.nutritionContext,
      protocols: candidate.protocols,
      trainingProtocol: { trainingStrategy: { weeklyFrequencies: {}, progression: { pace: "steady" } } },
    });
    expect(sections.find((item) => item.title === "Energy Strategy").items[0].title).toBe("Maintenance Calibration");
    expect(sections.find((item) => item.title === "Supplements").subtitle).toBe("4 active protocols");
    expect(sections.find((item) => item.title === "Recovery").items).toEqual([
      expect.objectContaining({ title: "Foam Rolling", status: "Active" }),
    ]);
    expect(sections.find((item) => item.title === "Execution").subtitle).toBe("5 recurring commitments");
    expect(sections.find((item) => item.title === "Execution").items.map((item) => item.id)).toEqual([
      "execution_foam_roll",
      "execution_morning_weigh_in",
      "execution_progress_photos",
      "execution_retatrutide",
      "execution_tesamorelin",
    ]);
  });

  it("derives recurring commitments only from active authoritative Execution ownership", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    const activeProtocol = candidate.protocols.find((item) => item.status === "active");
    const fixtures = [
      ...candidate.executionItems,
      { id: "archived", active: false, cadence: { type: "daily" } },
      { id: "paused", active: true, status: "paused", cadence: { type: "daily" } },
      { id: "one-time", active: true, cadence: { type: "scheduled_date" } },
      { id: "completed", active: true, cadence: { type: "daily" }, completedAt: "2026-07-23" },
      { id: "orphan", active: true, type: "supplement", protocolRootId: "archived-protocol", cadence: { type: "daily" } },
      { id: "similar-a", active: true, cadence: { type: "daily" }, linkedProtocolId: activeProtocol.id },
      { id: "similar-b", active: true, cadence: { type: "daily" }, linkedProtocolId: activeProtocol.id },
    ];
    const first = deriveAuthoritativeRecurringExecutionItems({
      executionItems: fixtures,
      protocols: candidate.protocols,
    });
    const second = deriveAuthoritativeRecurringExecutionItems({
      executionItems: fixtures.slice().reverse(),
      protocols: candidate.protocols,
    });
    const ids = first.map((item) => item.id);

    expect(ids).not.toEqual(expect.arrayContaining([
      "archived",
      "paused",
      "one-time",
      "completed",
      "orphan",
    ]));
    expect(ids).toEqual(expect.arrayContaining(["similar-a", "similar-b"]));
    expect(second.map((item) => item.id).sort()).toEqual(ids.slice().sort());
    expect(candidate.executionItems.filter((item) => item.id === "execution_dexa")).toHaveLength(1);
  });

  it("relinks retained peptide Execution by stable reminder identity", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);

    for (const [executionId, protocolId] of [
      ["execution_retatrutide", "protocol_retatrutide_founder"],
      ["execution_tesamorelin", "protocol_tesamorelin_founder"],
    ]) {
      expect(candidate.executionItems.find((item) => item.id === executionId)).toMatchObject({
        linkedProtocolId: protocolId,
        currentGoalIds: [plan.targetGoalId],
      });
    }
  });

  it("merges a same-day Retatrutide dose change into the active execution", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    const priorities = createDailyFocusService().getDailyFocus({
      protocols: candidate.protocols,
      reminders: candidate.reminders,
      now: new Date(2026, 6, 23, 8),
    });
    expect(priorities.map((item) => item.id)).toContain("reminder_retatrutide");
    expect(priorities.map((item) => item.id))
      .not.toContain("dose-change-protocol_retatrutide_founder-2026-07-23");
    expect(candidate.protocols.filter((item) => item.status !== "active" && (item.doseHistory ?? []).length)
      .every((item) => !priorities.some((priority) => priority.id.includes(item.id)))).toBe(true);
  });

  it("does not mutate goals, phases, evidence, briefings, or historical occurrence collections", () => {
    const before = load();
    const protectedBefore = snapshotProtected(before);
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    expect(snapshotProtected(candidate)).toEqual(protectedBefore);
  });
});

describe("atomic migration safety", () => {
  it("commits atomically and returns already_reconciled without a second write", async () => {
    const fixture = isolatedStore();
    const beforeBytes = fs.readFileSync(fixture);
    const service = createProtocolReconciliationMigrationService({
      filePath: fixture,
      now: () => new Date("2026-07-23T16:00:00.000Z"),
    });
    const preview = service.preview();
    const first = await service.execute({
      expectedRuntimeHash: preview.beforeFingerprint,
      expectedPlanFingerprint: fingerprintProtocolReconciliationPlan(preview.plan),
    });
    expect(first.status).toBe("reconciled");
    const firstBytes = fs.readFileSync(fixture);
    const second = await service.execute({ expectedRuntimeHash: hash(firstBytes) });
    expect(second.status).toBe("already_reconciled");
    expect(fs.readFileSync(fixture)).toEqual(firstBytes);
    expect(firstBytes).not.toEqual(beforeBytes);
  }, 30000);

  it("blocks stale writes and writes nothing", async () => {
    const fixture = isolatedStore();
    const bytes = fs.readFileSync(fixture);
    const service = createProtocolReconciliationMigrationService({ filePath: fixture });
    await expect(service.execute({ expectedRuntimeHash: "stale" })).rejects.toMatchObject({
      code: "STALE_WRITE_CONFLICT",
    });
    expect(fs.readFileSync(fixture)).toEqual(bytes);
  }, 20000);

  it("writes nothing when candidate invariants fail", () => {
    const before = load();
    const plan = buildProtocolReconciliationPlan(before);
    const { candidate } = applyProtocolReconciliationPlan(before, plan);
    candidate.protocols.find((item) => item.status === "active").status = "planned";
    expect(() => validateProtocolReconciliationPostState(before, candidate, plan)).toThrowError(
      ProtocolReconciliationMigrationError
    );
  });
});

function isolatedStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-protocol-reconcile-"));
  temporaryDirectories.push(directory);
  const target = path.join(directory, "runtime-store.json");
  fs.copyFileSync(productionPath, target);
  return target;
}
function snapshotProtected(store) {
  return structuredClone({
    goals: store.goals,
    canonicalEvidenceObjects: store.canonicalEvidenceObjects,
    evidencePackages: store.evidencePackages,
    evidenceReviews: store.evidenceReviews,
    analyses: store.analyses,
    dailyBriefings: store.dailyBriefings,
    dexaScans: store.dexaScans,
    progressPhotos: store.progressPhotos,
    weightEntries: store.weightEntries,
    dailyCheckIns: store.dailyCheckIns,
  });
}

function resolvePreMigrationFixture() {
  const live = path.resolve(process.cwd(), "private/founder/runtime-store.json");
  const liveStore = JSON.parse(fs.readFileSync(live, "utf8"));
  if (liveStore.protocols?.filter((item) => item.status === "planned").length === 15) return live;
  const backupDirectory = path.resolve(process.cwd(), "private/founder/backups");
  const expectedHash = "da47baa8a62b5289756740c8211a4321e571f3648015497bc4d8a318cb742e9a";
  const backup = fs.readdirSync(backupDirectory)
    .filter((name) => name.startsWith("runtime-store.protocol-reconciliation."))
    .map((name) => path.join(backupDirectory, name))
    .find((candidate) => hash(fs.readFileSync(candidate)) === expectedHash);
  if (!backup) throw new Error("The verified pre-migration protocol reconciliation fixture is unavailable.");
  return backup;
}
