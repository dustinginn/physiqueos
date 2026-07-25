import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SupplementProtocolRepairOutcome as O,
  createSupplementProtocolStateRepairService,
} from "./SupplementProtocolStateRepairService";
import {
  ActiveProtocolSuccessorOutcome,
  createActiveProtocolSuccessorService,
  resolveProtocolVersionAtDate,
} from "./ActiveProtocolSuccessorService";
import { createProtocolVersionRepository } from "../../data/repositories/ProtocolVersionRepository";
import { FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Supplement protocol-state repair", () => {
  it.each([
    ["Tongkat Ali", "Daily supplement support."],
    ["Fadogia Agrestis", "Every-other-day supplement support."],
    ["Multivitamin", "Daily micronutrient support."],
    ["Electrolytes", "Daily hydration support."],
  ])("repairs characterized zero-version %s state atomically", async (name, notes) => {
    const fixture = createFixture({ protocol: root({ name, notes }) });
    const before = structuredClone(fixture.liveStore.protocols[0]);
    const result = await fixture.service.repair(input());
    expect(result).toMatchObject({
      outcome: O.SUCCESS,
      committed: true,
      protocolId: "supplement",
      versionId: "supplement_v1",
      revision: 8,
    });
    expect(fixture.liveStore.protocols[0]).toEqual({
      ...before,
      currentVersionId: "supplement_v1",
    });
    expect(fixture.liveStore.protocolVersions).toHaveLength(1);
    expect(fixture.liveStore.protocolVersions[0]).toMatchObject({
      id: "supplement_v1",
      protocolId: "supplement",
      versionNumber: 1,
      status: "active",
      effectiveAt: "2026-07-23",
      endedAt: null,
      goalLinks: [{ goalId: "goal-build", relationship: "supports" }],
      intent: { summary: notes },
      supplementStrategy: { name, purpose: null, role: notes },
      evidenceBasis: {
        rootProtocolId: "supplement",
        rootName: name,
        rootStrategyContext: notes,
        activationEffectiveAt: "2026-07-23T16:54:00.550Z",
      },
    });
    expect(fixture.liveStore.protocolVersions[0]).not.toHaveProperty("dose");
    expect(fixture.liveStore.protocolVersions[0]).not.toHaveProperty("schedule");
    expect(fixture.liveStore.protocolVersions[0]).not.toHaveProperty("frequency");
  });

  it("preserves all root fields and copies provenance, identity, Goal, and dates exactly", async () => {
    const fixture = createFixture();
    const beforeRoot = structuredClone(fixture.liveStore.protocols[0]);
    const beforeOther = structuredClone({
      executionItems: fixture.liveStore.executionItems,
      reminders: fixture.liveStore.reminders,
      dailyBriefings: fixture.liveStore.dailyBriefings,
    });
    await fixture.service.repair(input());
    const afterRoot = structuredClone(fixture.liveStore.protocols[0]);
    delete afterRoot.currentVersionId;
    expect(afterRoot).toEqual(beforeRoot);
    const version = fixture.liveStore.protocolVersions[0];
    expect(version.change.provenance).toEqual({
      source: beforeRoot.source,
      fieldProvenance: beforeRoot.fieldProvenance,
      reconciliation: beforeRoot.reconciliation,
    });
    expect(version.author).toEqual({
      type: beforeRoot.source.type,
      id: beforeRoot.userId,
      displayName: beforeRoot.source.name,
    });
    expect({
      executionItems: fixture.liveStore.executionItems,
      reminders: fixture.liveStore.reminders,
      dailyBriefings: fixture.liveStore.dailyBriefings,
    }).toEqual(beforeOther);
  });

  it("resolves current and historical versions and accepts an isolated successor", async () => {
    const fixture = createFixture();
    await fixture.service.repair(input());
    const repository = createProtocolVersionRepository(fixture.liveStore.protocolVersions);
    expect(await repository.getCurrentVersion("supplement")).toMatchObject({
      id: "supplement_v1",
      status: "active",
    });
    expect(resolveProtocolVersionAtDate(fixture.liveStore.protocolVersions, "2026-07-22")).toBeNull();
    expect(resolveProtocolVersionAtDate(fixture.liveStore.protocolVersions, "2026-07-23")).toMatchObject({
      id: "supplement_v1",
    });

    const successor = createActiveProtocolSuccessorService({
      runtimeStorePath: fixture.filePath,
      liveStore: fixture.liveStore,
      now: () => new Date("2026-07-26T12:00:00.000Z"),
    });
    const current = fixture.liveStore.protocolVersions[0];
    const result = await successor.createSuccessor({
      protocolId: "supplement",
      expectedCurrentVersionId: "supplement_v1",
      effectiveDate: "2026-07-26",
      goalAssociation: { goalId: "goal-build", relationship: "supports" },
      provenance: {
        author: { type: "user", id: "user", displayName: "Founder" },
        reason: "Update supplement strategy.",
        confirmation: { confirmedByUser: true },
        details: { source: "isolated_follow_on" },
      },
      successorVersion: {
        ...current,
        supplementStrategy: { ...current.supplementStrategy, role: "Updated role." },
        intent: { summary: "Updated role." },
      },
    });
    expect(result.outcome).toBe(ActiveProtocolSuccessorOutcome.SUCCESS);
  });

  it("is idempotent and leaves an already repaired protocol byte-for-byte unchanged", async () => {
    const fixture = createFixture();
    expect((await fixture.service.repair(input())).outcome).toBe(O.SUCCESS);
    const beforeSecond = snapshot(fixture);
    expect(await fixture.service.repair(input())).toMatchObject({
      outcome: O.ALREADY_REPAIRED,
      committed: false,
      versionId: "supplement_v1",
    });
    expect(snapshot(fixture)).toBe(beforeSecond);
  });

  it.each([
    ["inactive", O.PROTOCOL_NOT_ACTIVE, { protocol: root({ status: "paused" }) }],
    ["wrong category", O.INVALID_PROTOCOL_CATEGORY, { protocol: root({ category: "recovery" }) }],
    ["unexpected pointer", O.UNEXPECTED_CURRENT_VERSION, { protocol: root({ currentVersionId: "missing" }) }],
    ["existing version", O.UNEXPECTED_EXISTING_VERSIONS, { versions: [{ id: "unexpected", protocolId: "supplement", status: "planned" }] }],
    ["invalid Goal", O.INVALID_GOAL, { protocol: root({ currentGoalIds: ["other"] }) }],
    ["invalid provenance", O.INVALID_PROVENANCE, { protocol: root({ reconciliation: null }) }],
    ["invalid strategy", O.INVALID_STRATEGY, { protocol: root({ notes: "" }) }],
  ])("rejects %s without writes", async (_label, expected, options) => {
    const fixture = createFixture(options);
    const before = snapshot(fixture);
    expect((await fixture.service.repair(input())).outcome).toBe(expected);
    expect(snapshot(fixture)).toBe(before);
  });

  it("rolls back exactly on concurrency", async () => {
    const error = new Error("revision conflict");
    error.code = FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT;
    const fixture = createFixture({ faults: { beforeCommit: () => { throw error; } } });
    const before = snapshot(fixture);
    expect((await fixture.service.repair(input())).outcome).toBe(O.CONCURRENCY_CONFLICT);
    expect(snapshot(fixture)).toBe(before);
  });

  it.each([
    ["version append", O.PERSISTENCE_FAILURE, { afterVersionAppend: () => { throw new Error("append"); } }],
    ["root update", O.PERSISTENCE_FAILURE, { afterRootUpdate: () => { throw new Error("root"); } }],
    ["verification", O.VERIFICATION_FAILURE, { beforeFinalVerification: () => { throw new Error("verify"); } }],
  ])("rolls back exactly after %s failure", async (_label, expected, faults) => {
    const fixture = createFixture({ faults });
    const before = snapshot(fixture);
    expect((await fixture.service.repair(input())).outcome).toBe(expected);
    expect(snapshot(fixture)).toBe(before);
    expect(fixture.liveStore.protocolVersions).toHaveLength(0);
  });
});

function createFixture({
  protocol = root(),
  versions = [],
  faults = {},
} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "supplement-repair-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    revision: 7,
    updatedAt: "2026-07-25T11:00:00.000Z",
    user: { id: "user" },
    goals: [{ id: "goal-build", userId: "user", status: "active", primary: true }],
    protocols: [structuredClone(protocol)],
    protocolVersions: structuredClone(versions),
    executionItems: [{ id: "execution" }],
    reminders: [{ id: "reminder" }],
    dailyBriefings: [{ id: "history" }],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return {
    filePath,
    liveStore,
    service: createSupplementProtocolStateRepairService({
      runtimeStorePath: filePath,
      liveStore,
      faults,
      now: () => new Date("2026-07-25T12:00:00.000Z"),
    }),
  };
}

function root(overrides = {}) {
  return {
    id: "supplement",
    userId: "user",
    name: "Tongkat Ali",
    category: "supplement",
    relatedGoalIds: ["goal-build", "goal-old"],
    currentGoalIds: ["goal-build"],
    historicalGoalIds: ["goal-old"],
    status: "active",
    startDate: null,
    endDate: null,
    dose: { value: null, unit: "" },
    frequency: { interval: 1, unit: "day", daysOfWeek: [] },
    schedule: { type: "daily", frequency: "daily", timeOfDay: null },
    notes: "Daily supplement support.",
    source: { type: "manual", name: "Founder", confidence: "high" },
    fieldProvenance: { imported: ["name", "notes", "schedule"], computed: [] },
    updatedAt: "2026-07-23T16:54:00.550Z",
    reconciliation: {
      migrationId: "visible_abs_to_build_lean_mass_protocol_reconciliation_v1",
      action: "retained",
      reconciledAt: "2026-07-23T16:54:00.550Z",
      cancelledPlannedProtocolId: "cancelled-plan",
    },
    ...overrides,
  };
}

function input() {
  return { protocolId: "supplement", expectedGoalId: "goal-build" };
}
function snapshot(fixture) {
  return JSON.stringify({
    live: fixture.liveStore,
    persisted: JSON.parse(fs.readFileSync(fixture.filePath, "utf8")),
  });
}
