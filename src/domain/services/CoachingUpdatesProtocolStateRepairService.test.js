import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CoachingUpdatesProtocolRepairOutcome as O,
  createCoachingUpdatesProtocolStateRepairService,
} from "./CoachingUpdatesProtocolStateRepairService";
import {
  ActiveProtocolSuccessorOutcome,
  createActiveProtocolSuccessorService,
} from "./ActiveProtocolSuccessorService";
import { createProtocolVersionRepository } from "../../data/repositories/ProtocolVersionRepository";
import { FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Coaching Updates protocol-state repair", () => {
  it("atomically promotes the existing characterized version and changes only lifecycle state", async () => {
    const fixture = createFixture();
    const before = structuredClone(fixture.liveStore);
    const result = await fixture.service.repair(input());

    expect(result).toMatchObject({
      outcome: O.SUCCESS,
      committed: true,
      protocolId: "coaching",
      versionId: "coaching-v1",
      revision: 8,
    });
    expect(fixture.liveStore.protocols[0]).toEqual({
      ...before.protocols[0],
      currentVersionId: "coaching-v1",
    });
    expect(fixture.liveStore.protocolVersions).toEqual([
      { ...before.protocolVersions[0], status: "active" },
    ]);
    expect(fixture.liveStore.protocolVersions).toHaveLength(1);
    expect(activeVersions(fixture.liveStore)).toEqual(["coaching-v1"]);

    const preserved = structuredClone(fixture.liveStore);
    preserved.revision = before.revision;
    preserved.updatedAt = before.updatedAt;
    delete preserved.lastCommitId;
    preserved.protocols[0] = before.protocols[0];
    preserved.protocolVersions[0] = before.protocolVersions[0];
    expect(preserved).toEqual(before);
  });

  it("preserves cadence, Goal, provenance, dates, ids, reminders, and historical artifacts exactly", async () => {
    const fixture = createFixture();
    const before = structuredClone(fixture.liveStore);
    await fixture.service.repair(input());

    const afterProtocol = fixture.liveStore.protocols[0];
    const afterVersion = fixture.liveStore.protocolVersions[0];
    expect(afterProtocol.effectiveStrategy).toEqual(before.protocols[0].effectiveStrategy);
    expect(afterProtocol.currentGoalIds).toEqual(before.protocols[0].currentGoalIds);
    expect(afterProtocol.relatedGoalIds).toEqual(before.protocols[0].relatedGoalIds);
    expect(afterProtocol.activationIdentity).toEqual(before.protocols[0].activationIdentity);
    expect(afterProtocol.activationProvenance).toEqual(before.protocols[0].activationProvenance);
    expect(afterProtocol.activatedAt).toBe(before.protocols[0].activatedAt);
    expect(afterVersion).toMatchObject({
      id: before.protocolVersions[0].id,
      effectiveAt: before.protocolVersions[0].effectiveAt,
      change: before.protocolVersions[0].change,
      goalLinks: before.protocolVersions[0].goalLinks,
      confirmation: before.protocolVersions[0].confirmation,
    });
    expect(fixture.liveStore.operatingPlan).toEqual(before.operatingPlan);
    expect(fixture.liveStore.reminders).toEqual(before.reminders);
    expect(fixture.liveStore.dailyBriefings).toEqual(before.dailyBriefings);
  });

  it("is idempotent and performs no second write", async () => {
    const fixture = createFixture();
    expect((await fixture.service.repair(input())).outcome).toBe(O.SUCCESS);
    const afterFirst = snapshot(fixture);
    expect(await fixture.service.repair(input())).toMatchObject({
      outcome: O.ALREADY_REPAIRED,
      committed: false,
      versionId: "coaching-v1",
    });
    expect(snapshot(fixture)).toBe(afterFirst);
  });

  it("allows getCurrentVersion and a follow-on successor after repair", async () => {
    const fixture = createFixture();
    await fixture.service.repair(input());
    const repository = createProtocolVersionRepository(fixture.liveStore.protocolVersions);
    expect(await repository.getCurrentVersion("coaching")).toMatchObject({
      id: "coaching-v1",
      status: "active",
    });

    const successor = createActiveProtocolSuccessorService({
      runtimeStorePath: fixture.filePath,
      liveStore: fixture.liveStore,
      now: () => new Date("2026-07-26T12:00:00.000Z"),
    });
    const result = await successor.createSuccessor({
      protocolId: "coaching",
      expectedCurrentVersionId: "coaching-v1",
      effectiveDate: "2026-07-26",
      goalAssociation: { goalId: "goal-build", relationship: "supports" },
      provenance: {
        author: { type: "user", id: "user", displayName: "Founder" },
        reason: "Update the active Coaching Updates strategy.",
        confirmation: { confirmedByUser: true },
        details: { source: "isolated_follow_on" },
      },
      successorVersion: {
        intent: { summary: "Keep Goal coaching available twice weekly." },
        expectations: [],
        evaluationWindows: [],
        coachingPolicy: {},
        reviewTriggers: [],
        evidenceBasis: {},
        effectiveStrategy: {
          cadence: "Twice weekly",
          days: ["Tuesday", "Sunday"],
          dailyEvidenceCollection: true,
        },
      },
    });
    expect(result.outcome).toBe(ActiveProtocolSuccessorOutcome.SUCCESS);
  });

  it.each([
    ["missing protocol", O.PROTOCOL_NOT_FOUND, { protocols: [] }],
    ["inactive protocol", O.PROTOCOL_NOT_ACTIVE, {
      protocols: [{ ...protocol(), status: "planned" }],
    }],
    ["unexpected pointer", O.UNEXPECTED_CURRENT_VERSION, {
      protocols: [{ ...protocol(), currentVersionId: "other" }],
    }],
    ["missing eligible version", O.ELIGIBLE_VERSION_MISSING, { versions: [] }],
    ["ambiguous versions", O.AMBIGUOUS_VERSIONS, {
      versions: [plannedVersion(), { ...plannedVersion(), id: "coaching-v2", versionNumber: 2 }],
    }],
    ["unpointed active version", O.INVALID_LIFECYCLE, {
      versions: [{ ...plannedVersion(), status: "active" }],
    }],
    ["invalid Goal", O.INVALID_GOAL, {
      versions: [{
        ...plannedVersion(),
        goalLinks: [{ goalId: "other", relationship: "supports" }],
      }],
    }],
    ["invalid provenance", O.INVALID_PROVENANCE, {
      protocols: [{ ...protocol(), activationProvenance: null }],
    }],
    ["invalid cadence", O.INVALID_CADENCE, {
      protocols: [{
        ...protocol(),
        effectiveStrategy: { ...cadence(), days: ["Tuesday", "Sunday"] },
      }],
    }],
  ])("rejects %s without writes", async (_label, expected, options) => {
    const fixture = createFixture(options);
    const before = snapshot(fixture);
    expect((await fixture.service.repair(input())).outcome).toBe(expected);
    expect(snapshot(fixture)).toBe(before);
  });

  it("rejects an unexpected characterized version id without writes", async () => {
    const fixture = createFixture();
    const before = snapshot(fixture);
    expect((await fixture.service.repair({
      ...input(),
      expectedVersionId: "other",
    })).outcome).toBe(O.ELIGIBLE_VERSION_MISSING);
    expect(snapshot(fixture)).toBe(before);
  });

  it("maps revision contention to a concurrency conflict and rolls back exactly", async () => {
    const conflict = new Error("revision changed");
    conflict.code = FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT;
    const fixture = createFixture({
      faults: { beforeCommit: () => { throw conflict; } },
    });
    const before = snapshot(fixture);
    expect(await fixture.service.repair(input())).toMatchObject({
      outcome: O.CONCURRENCY_CONFLICT,
      committed: false,
    });
    expect(snapshot(fixture)).toBe(before);
  });

  it.each([
    ["promotion", { afterPromotion: () => { throw new Error("promotion failed"); } }],
    ["root update", { afterRootUpdate: () => { throw new Error("root update failed"); } }],
    ["final verification", {
      beforeFinalVerification: () => { throw new Error("verification failed"); },
    }],
  ])("rolls back exactly when %s fails", async (_label, faults) => {
    const fixture = createFixture({ faults });
    const before = snapshot(fixture);
    expect(await fixture.service.repair(input())).toMatchObject({
      outcome: O.PERSISTENCE_FAILURE,
      committed: false,
    });
    expect(snapshot(fixture)).toBe(before);
  });

  it("exposes rollback_failure when persistence committed before publication failed", async () => {
    const committedError = Object.assign(new Error("publication"), { committed: true });
    const createUnitOfWork = () => ({
      begin: () => ({
        inspect: () => structuredClone(baseStore()),
        mutate: async () => ({ protocolId: "coaching", versionId: "coaching-v1" }),
        commit: async () => { throw committedError; },
      }),
    });
    const fixture = createFixture({ createUnitOfWork });
    expect(await fixture.service.repair(input())).toMatchObject({
      outcome: O.ROLLBACK_FAILURE,
      committed: false,
    });
  });
});

function createFixture({
  protocols = [protocol()],
  versions = [plannedVersion()],
  faults = {},
  createUnitOfWork,
} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "coaching-repair-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = baseStore({ protocols, versions });
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return {
    filePath,
    liveStore,
    service: createCoachingUpdatesProtocolStateRepairService({
      runtimeStorePath: filePath,
      liveStore,
      faults,
      createUnitOfWork,
      now: () => new Date("2026-07-25T12:00:00.000Z"),
    }),
  };
}

function baseStore({ protocols = [protocol()], versions = [plannedVersion()] } = {}) {
  return {
    version: "isolated",
    revision: 7,
    updatedAt: "2026-07-25T11:00:00.000Z",
    user: { id: "user" },
    goals: [{ id: "goal-build", userId: "user", primary: true, status: "active" }],
    protocols: structuredClone(protocols),
    protocolVersions: structuredClone(versions),
    operatingPlan: {
      coachingCadence: {
        type: "twice_weekly",
        days: ["wednesday", "sunday"],
        recommendationReason: "Use two calibration surfaces.",
      },
    },
    reminders: [{
      id: "scheduler-intent",
      intentType: "apply_goal_transition_schedule",
      status: "pending_after_commit",
    }],
    dailyBriefings: [
      { id: "midweek-history", cadence: "midweek" },
      { id: "weekly-history", cadence: "weekly" },
      { id: "photo-history", cadence: "event", trigger: { evidenceType: "photo_session" } },
      { id: "dexa-history", cadence: "event", trigger: { evidenceType: "dexa" } },
    ],
    executionItems: [],
    canonicalEvidenceObjects: [],
  };
}

function protocol() {
  return {
    id: "coaching",
    userId: "user",
    protocolType: "briefings",
    category: "briefings",
    name: "Twice weekly on Wednesday and Sunday.",
    status: "active",
    sourceProtocolId: "virtual_briefings",
    relatedGoalIds: ["goal-build"],
    currentGoalIds: ["goal-build"],
    effectiveStrategy: cadence(),
    activationIdentity: {
      transitionId: "transition",
      reviewId: "review",
      sourceProtocolId: "virtual_briefings",
    },
    activationProvenance: {
      sourceProtocolId: "virtual_briefings",
      sourceVersionId: null,
      provenanceSourceType: "virtual_plan",
      ownershipTransferred: false,
    },
    activatedAt: "2026-07-23T16:54:00.550Z",
    updatedAt: "2026-07-23T16:54:00.550Z",
  };
}

function plannedVersion() {
  return {
    id: "coaching-v1",
    protocolId: "coaching",
    versionNumber: 1,
    status: "planned",
    effectiveAt: "2026-07-21T04:53:31.757Z",
    change: {
      reason: "Activate update disposition for the new goal.",
      previousVersionId: null,
      reviewedChanges: cadence(),
    },
    goalLinks: [{ goalId: "goal-build", relationship: "supports" }],
    confirmation: { authority: "accepted_goal_transition" },
  };
}

function cadence() {
  return {
    cadence: "Twice weekly",
    days: ["Wednesday", "Sunday"],
    dailyEvidenceCollection: true,
  };
}

function input() {
  return {
    protocolId: "coaching",
    expectedVersionId: "coaching-v1",
    expectedGoalId: "goal-build",
  };
}

function activeVersions(store) {
  return store.protocolVersions
    .filter((item) => item.status === "active" && !item.endedAt)
    .map((item) => item.id);
}

function snapshot(fixture) {
  return JSON.stringify({
    live: fixture.liveStore,
    persisted: JSON.parse(fs.readFileSync(fixture.filePath, "utf8")),
  });
}
