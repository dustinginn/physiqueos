import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActiveProtocolSuccessorOutcome as O,
  createActiveProtocolSuccessorService,
  resolveProtocolVersionAtDate,
} from "./ActiveProtocolSuccessorService";
import { createProtocolVersionService } from "./ProtocolVersionService";
import { createProtocolRepository } from "../../data/repositories/ProtocolRepository";
import { createProtocolVersionRepository } from "../../data/repositories/ProtocolVersionRepository";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("active protocol successor foundation", () => {
  it("atomically creates a Training successor and preserves historical resolution", async () => {
    const fixture = createFixture();
    const beforeCurrent = structuredClone(fixture.liveStore.protocolVersions[0]);
    const result = await fixture.service.createSuccessor(command());
    expect(result).toMatchObject({
      outcome: O.SUCCESS,
      committed: true,
      previousVersionId: "training-v2",
      successorVersionId: "training_v3",
    });
    const versions = fixture.liveStore.protocolVersions;
    expect(versions.filter((item) => item.status === "active")).toHaveLength(1);
    expect(versions.find((item) => item.id === "training-v2")).toEqual({
      ...beforeCurrent,
      status: "superseded",
      endedAt: "2026-07-26",
    });
    expect(fixture.liveStore.protocols[0]).toMatchObject({
      currentVersionId: "training_v3",
      status: "active",
      currentGoalIds: ["goal-build"],
      activationProvenance: { sourceProtocolId: "training-v1" },
    });
    const successor = versions.find((item) => item.id === "training_v3");
    expect(successor).toMatchObject({
      protocolId: "training",
      versionNumber: 3,
      effectiveAt: "2026-07-26",
      goalLinks: [{ goalId: "goal-build", relationship: "supports" }],
      change: { previousVersionId: "training-v2", reason: "Update active Training strategy." },
    });
    expect(resolveProtocolVersionAtDate(versions, "2026-07-25")?.id).toBe("training-v2");
    expect(resolveProtocolVersionAtDate(versions, "2026-07-26")?.id).toBe("training_v3");
  });

  it("rejects unchanged and duplicate semantic content without writes", async () => {
    const unchanged = createFixture();
    const unchangedBefore = snapshot(unchanged);
    const unchangedResult = await unchanged.service.createSuccessor(command({
      successorVersion: structuredClone(unchanged.liveStore.protocolVersions[0]),
    }));
    expect(unchangedResult.outcome).toBe(O.UNCHANGED_SUCCESSOR);
    expect(snapshot(unchanged)).toBe(unchangedBefore);

    const duplicate = createFixture({
      versions: [historicalVersion({
        ...successorPayload(),
        id: "training-v1",
        versionNumber: 1,
        effectiveAt: "2026-07-26",
        trainingStrategy: updatedStrategy(),
      }), activeVersion()],
    });
    const duplicateBefore = snapshot(duplicate);
    expect((await duplicate.service.createSuccessor(command())).outcome).toBe(O.DUPLICATE_SUCCESSOR);
    expect(snapshot(duplicate)).toBe(duplicateBefore);
  });

  it("rejects missing and stale expected version identities", async () => {
    const missing = createFixture();
    expect((await missing.service.createSuccessor(command({ expectedCurrentVersionId: null }))).outcome)
      .toBe(O.INVALID_SUCCESSOR);
    const stale = createFixture();
    expect((await stale.service.createSuccessor(command({ expectedCurrentVersionId: "training-v1" }))).outcome)
      .toBe(O.EXPECTED_VERSION_CONFLICT);
  });

  it("characterizes planned-only Nutrition as missing-current without mutation", async () => {
    const fixture = createFixture({
      protocols: [{
        id: "nutrition",
        userId: "user",
        protocolType: "nutrition",
        category: "nutrition",
        status: "active",
        currentGoalIds: ["goal-build"],
        relatedGoalIds: ["goal-build"],
      }],
      versions: [{
        ...activeVersion(),
        id: "nutrition-v1",
        protocolId: "nutrition",
        status: "planned",
      }],
    });
    const before = snapshot(fixture);
    const result = await fixture.service.createSuccessor(command({
      protocolId: "nutrition",
      expectedCurrentVersionId: "nutrition-v1",
    }));
    expect(result.outcome).toBe(O.CURRENT_VERSION_MISSING);
    expect(snapshot(fixture)).toBe(before);
  });

  it("rejects inactive roots, inactive current versions, invalid payloads, and invalid ownership", async () => {
    const inactiveRoot = createFixture({ protocols: [{ ...protocol(), status: "archived" }] });
    expect((await inactiveRoot.service.createSuccessor(command())).outcome).toBe(O.PROTOCOL_NOT_ACTIVE);
    const inactiveVersion = createFixture({ versions: [{ ...activeVersion(), status: "superseded", endedAt: "2026-07-25" }] });
    expect((await inactiveVersion.service.createSuccessor(command())).outcome).toBe(O.CURRENT_VERSION_NOT_ACTIVE);
    const invalid = createFixture();
    expect((await invalid.service.createSuccessor(command({
      successorVersion: { ...successorPayload(), intent: { summary: "" } },
    }))).outcome).toBe(O.INVALID_SUCCESSOR);
    const ownership = createFixture();
    expect((await ownership.service.createSuccessor(command({
      goalAssociation: { goalId: "other-goal", relationship: "supports" },
    }))).outcome).toBe(O.GOAL_OR_PROVENANCE_INVALID);
    const invalidDate = createFixture();
    expect((await invalidDate.service.createSuccessor(command({ effectiveDate: "2026-07-20" }))).outcome)
      .toBe(O.INVALID_SUCCESSOR);
  });

  it.each([
    ["append", { afterAppend: () => { throw new Error("append failure"); } }],
    ["supersede", { afterSupersede: () => { throw new Error("supersede failure"); } }],
    ["root update", { afterRootUpdate: () => { throw new Error("root failure"); } }],
    ["final verification", { beforeFinalVerification: () => { throw new Error("verify failure"); } }],
  ])("rolls back exactly after %s failure", async (_label, faults) => {
    const fixture = createFixture({ faults });
    const before = snapshot(fixture);
    const result = await fixture.service.createSuccessor(command());
    expect(result).toMatchObject({ outcome: O.PERSISTENCE_FAILURE, committed: false });
    expect(snapshot(fixture)).toBe(before);
    expect(fixture.liveStore.protocolVersions.some((item) => item.id === "training_v3")).toBe(false);
  });

  it("keeps initial activation behavior unchanged", async () => {
    const protocols = [];
    const versions = [];
    const service = createProtocolVersionService({
      repositories: {
        protocols: createProtocolRepository(protocols),
        protocolVersions: createProtocolVersionRepository(versions),
      },
    });
    const result = await service.activateInitialProtocol({
      protocol: { id: "new", userId: "user", protocolType: "training", category: "training" },
      version: {
        ...successorPayload(),
        id: "new-v1",
        effectiveAt: "2026-07-26",
        author: { type: "user", id: "user", displayName: "Founder" },
        confirmation: { confirmedByUser: true },
        createdAt: "2026-07-26T12:00:00.000Z",
      },
    });
    expect(result).toMatchObject({
      protocol: { currentVersionId: "new-v1", status: "active" },
      version: { id: "new-v1", status: "active", versionNumber: 1 },
    });
  });
});

function createFixture({
  protocols = [protocol()],
  versions = [activeVersion()],
  faults = {},
} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "protocol-successor-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    version: "isolated",
    revision: 4,
    updatedAt: "2026-07-25T12:00:00.000Z",
    user: { id: "user" },
    goals: [{ id: "goal-build", userId: "user", status: "active" }],
    protocols: structuredClone(protocols),
    protocolVersions: structuredClone(versions),
    executionItems: [{ id: "execution", schedule: { day: "monday" } }],
    dailyBriefings: [{ id: "briefing" }],
    canonicalEvidenceObjects: [{ id: "evidence" }],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  const service = createActiveProtocolSuccessorService({
    runtimeStorePath: filePath,
    liveStore,
    faults,
    now: () => new Date("2026-07-26T12:00:00.000Z"),
  });
  return { filePath, liveStore, service };
}

function protocol() {
  return {
    id: "training",
    userId: "user",
    protocolType: "training",
    category: "training",
    status: "active",
    currentVersionId: "training-v2",
    currentGoalIds: ["goal-build"],
    relatedGoalIds: ["goal-build"],
    activationProvenance: { sourceProtocolId: "training-v1" },
  };
}

function activeVersion() {
  return {
    id: "training-v2",
    protocolId: "training",
    versionNumber: 2,
    status: "active",
    effectiveAt: "2026-07-20",
    endedAt: null,
    author: { type: "user", id: "user", displayName: "Founder" },
    change: { reason: "Current strategy", previousVersionId: "training-v1" },
    goalLinks: [{ goalId: "goal-build", relationship: "supports" }],
    intent: { summary: "Build through structured training." },
    confirmation: { confirmedByUser: true },
    trainingStrategy: {
      weeklyFrequencies: { arms: 2, core: 2 },
      physiquePriorities: ["arms", "core"],
      progression: { pace: "moderate" },
      nutritionPhase: "maintenance",
    },
  };
}

function historicalVersion(overrides = {}) {
  return {
    ...activeVersion(),
    status: "superseded",
    endedAt: "2026-07-20",
    ...overrides,
  };
}

function updatedStrategy() {
  return {
    weeklyFrequencies: { arms: 3, core: 2 },
    physiquePriorities: ["arms", "core", "lower_body"],
    progression: { pace: "moderate" },
    nutritionPhase: "maintenance",
  };
}

function successorPayload() {
  return {
    intent: { summary: "Build through structured training." },
    expectations: [],
    evaluationWindows: [],
    coachingPolicy: {},
    reviewTriggers: [],
    evidenceBasis: {},
    phaseContext: { id: "maintenance", label: "Maintenance" },
    trainingStrategy: updatedStrategy(),
  };
}

function command(overrides = {}) {
  return {
    protocolId: "training",
    expectedCurrentVersionId: "training-v2",
    successorVersion: successorPayload(),
    effectiveDate: "2026-07-26",
    goalAssociation: { goalId: "goal-build", relationship: "supports" },
    provenance: {
      author: { type: "user", id: "user", displayName: "Founder" },
      reason: "Update active Training strategy.",
      confirmation: { confirmedByUser: true, authority: "founder_confirmation" },
      details: { source: "direct_strategy_edit" },
    },
    ...overrides,
  };
}

function snapshot(fixture) {
  return JSON.stringify({
    live: fixture.liveStore,
    persisted: JSON.parse(fs.readFileSync(fixture.filePath, "utf8")),
  });
}
