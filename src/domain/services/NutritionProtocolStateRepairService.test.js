import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  NutritionProtocolRepairOutcome as O,
  createNutritionProtocolStateRepairService,
} from "./NutritionProtocolStateRepairService";
import {
  ActiveProtocolSuccessorOutcome,
  createActiveProtocolSuccessorService,
} from "./ActiveProtocolSuccessorService";
import { resolveProteinTargetContext } from "./ProteinTargetContextService";
import { createProtocolVersionRepository } from "../../data/repositories/ProtocolVersionRepository";
import { FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Nutrition protocol-state repair", () => {
  it("promotes the characterized planned version without changing strategy or provenance", async () => {
    const fixture = createFixture();
    const beforeProtocol = structuredClone(fixture.liveStore.protocols[0]);
    const beforeVersion = structuredClone(fixture.liveStore.protocolVersions[0]);
    const result = await fixture.service.repair(input());
    expect(result).toMatchObject({ outcome: O.SUCCESS, committed: true, versionId: "nutrition-v1" });
    expect(fixture.liveStore.protocols[0]).toEqual({ ...beforeProtocol, currentVersionId: "nutrition-v1" });
    expect(fixture.liveStore.protocolVersions).toEqual([{ ...beforeVersion, status: "active" }]);
    expect(fixture.liveStore.protocolVersions.filter((item) => item.status === "active")).toHaveLength(1);
    expect(fixture.liveStore.protocols[0].effectiveStrategy).toMatchObject({
      proteinBasis: "body_weight",
      proteinRatio: 1,
      proteinTarget: 167,
      calorieStrategy: "increase_gradually",
      carbohydrateStrategy: "performance",
      fatStrategy: "sustainable_minimum",
    });
  });

  it("resolves repository current-version and body-weight target context after repair", async () => {
    const fixture = createFixture();
    await fixture.service.repair(input());
    const repository = createProtocolVersionRepository(fixture.liveStore.protocolVersions);
    expect(await repository.getCurrentVersion("nutrition")).toMatchObject({ id: "nutrition-v1", status: "active" });
    const context = resolveProteinTargetContext({
      userId: "user",
      goal: { id: "goal-build" },
      protocols: fixture.liveStore.protocols,
      protocolVersions: fixture.liveStore.protocolVersions,
      weights: [],
      window: { startDate: "2026-07-24", endDate: "2026-07-25" },
    });
    expect(context).toMatchObject({
      mode: "grams_per_pound",
      ratio: 1,
      protocolVersion: "nutrition-v1",
    });
  });

  it("enables an isolated successor after repair", async () => {
    const fixture = createFixture();
    await fixture.service.repair(input());
    const successor = createActiveProtocolSuccessorService({
      runtimeStorePath: fixture.filePath,
      liveStore: fixture.liveStore,
      now: () => new Date("2026-07-26T12:00:00.000Z"),
    });
    const result = await successor.createSuccessor({
      protocolId: "nutrition",
      expectedCurrentVersionId: "nutrition-v1",
      effectiveDate: "2026-07-26",
      goalAssociation: { goalId: "goal-build", relationship: "supports" },
      provenance: {
        author: { type: "user", id: "user", displayName: "Founder" },
        reason: "Update active Nutrition strategy.",
        confirmation: { confirmedByUser: true },
        details: { source: "isolated_follow_on" },
      },
      successorVersion: {
        intent: { summary: "Support the active Goal with a body-weight protein rule." },
        expectations: [],
        evaluationWindows: [],
        coachingPolicy: {},
        reviewTriggers: [],
        evidenceBasis: {},
        effectiveStrategy: {
          ...fixture.liveStore.protocols[0].effectiveStrategy,
          proteinRatio: 1.1,
        },
      },
    });
    expect(result.outcome).toBe(ActiveProtocolSuccessorOutcome.SUCCESS);
  });

  it("is idempotent and leaves already-valid Nutrition states unchanged", async () => {
    const fixture = createFixture();
    expect((await fixture.service.repair(input())).outcome).toBe(O.SUCCESS);
    const beforeSecond = snapshot(fixture);
    expect((await fixture.service.repair(input())).outcome).toBe(O.ALREADY_REPAIRED);
    expect(snapshot(fixture)).toBe(beforeSecond);

    const valid = createFixture({
      protocols: [{ ...protocol(), currentVersionId: "nutrition-v1" }],
      versions: [{ ...plannedVersion(), status: "active" }],
    });
    const beforeValid = snapshot(valid);
    expect((await valid.service.repair(input())).outcome).toBe(O.ALREADY_REPAIRED);
    expect(snapshot(valid)).toBe(beforeValid);
  });

  it("rejects ambiguous plans, invalid provenance, ownership, and unexpected lifecycle without writes", async () => {
    const cases = [
      [O.AMBIGUOUS_ELIGIBLE_VERSIONS, {
        versions: [plannedVersion(), { ...plannedVersion(), id: "nutrition-v2", versionNumber: 2 }],
      }],
      [O.INVALID_PROVENANCE, {
        protocols: [{ ...protocol(), activationProvenance: null }],
      }],
      [O.INVALID_GOAL_ASSOCIATION, {
        versions: [{ ...plannedVersion(), goalLinks: [{ goalId: "other", relationship: "supports" }] }],
      }],
      [O.INVALID_VERSION_LIFECYCLE, {
        versions: [{ ...plannedVersion(), status: "active" }],
      }],
      [O.INVALID_NUTRITION_STRATEGY, {
        protocols: [{ ...protocol(), effectiveStrategy: { ...strategy(), proteinRatio: 0.8 } }],
      }],
    ];
    for (const [expected, options] of cases) {
      const fixture = createFixture(options);
      const before = snapshot(fixture);
      expect((await fixture.service.repair(input())).outcome).toBe(expected);
      expect(snapshot(fixture)).toBe(before);
    }
  });

  it("returns a concurrency conflict without applying staged writes", async () => {
    const conflict = new Error("conflict");
    conflict.code = FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT;
    const fixture = createFixture({ faults: { beforeCommit: () => { throw conflict; } } });
    const before = snapshot(fixture);
    expect((await fixture.service.repair(input())).outcome).toBe(O.CONCURRENCY_CONFLICT);
    expect(snapshot(fixture)).toBe(before);
  });

  it.each([
    ["promotion", { afterPromotion: () => { throw new Error("promotion"); } }],
    ["root update", { afterRootUpdate: () => { throw new Error("root"); } }],
    ["final verification", { beforeFinalVerification: () => { throw new Error("verify"); } }],
  ])("rolls back exactly after %s failure", async (_label, faults) => {
    const fixture = createFixture({ faults });
    const before = snapshot(fixture);
    expect(await fixture.service.repair(input())).toMatchObject({
      outcome: O.PERSISTENCE_FAILURE,
      committed: false,
    });
    expect(snapshot(fixture)).toBe(before);
    expect(fixture.liveStore.protocolVersions).toHaveLength(1);
  });
});

function createFixture({
  protocols = [protocol()],
  versions = [plannedVersion()],
  faults = {},
} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nutrition-repair-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    version: "isolated",
    revision: 7,
    updatedAt: "2026-07-25T12:00:00.000Z",
    user: { id: "user" },
    goals: [{ id: "goal-build", userId: "user", primary: true, status: "active" }],
    protocols: structuredClone(protocols),
    protocolVersions: structuredClone(versions),
    executionItems: [{ id: "execution" }],
    dailyBriefings: [{ id: "briefing" }],
    canonicalEvidenceObjects: [{ id: "evidence" }],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return {
    filePath,
    liveStore,
    service: createNutritionProtocolStateRepairService({
      runtimeStorePath: filePath,
      liveStore,
      faults,
      now: () => new Date("2026-07-25T12:00:00.000Z"),
    }),
  };
}

function protocol() {
  return {
    id: "nutrition",
    userId: "user",
    protocolType: "nutrition",
    category: "nutrition",
    status: "active",
    currentGoalIds: ["goal-build"],
    relatedGoalIds: ["goal-build"],
    effectiveStrategy: strategy(),
    activationIdentity: {
      transitionId: "transition",
      reviewId: "review",
      sourceProtocolId: "historical-nutrition",
    },
    activationProvenance: {
      sourceProtocolId: "historical-nutrition",
      sourceVersionId: "historical-nutrition-v1",
      provenanceSourceType: "historical_protocol",
      ownershipTransferred: false,
    },
    activatedAt: "2026-07-23T12:00:00.000Z",
  };
}

function strategy() {
  return {
    proteinBasis: "body_weight",
    proteinRatio: 1,
    proteinTarget: 167,
    fixedProtein: 180,
    calorieStrategy: "increase_gradually",
    carbohydrateStrategy: "performance",
    fatStrategy: "sustainable_minimum",
  };
}

function plannedVersion() {
  return {
    id: "nutrition-v1",
    protocolId: "nutrition",
    versionNumber: 1,
    status: "planned",
    effectiveAt: "2026-07-21T04:53:31.757Z",
    change: {
      reason: "Activate update disposition for the new goal.",
      previousVersionId: "historical-nutrition-v1",
      reviewedChanges: strategy(),
    },
    goalLinks: [{ goalId: "goal-build", relationship: "supports" }],
    confirmation: { authority: "accepted_goal_transition" },
  };
}

function input() {
  return { protocolId: "nutrition", expectedGoalId: "goal-build" };
}

function snapshot(fixture) {
  return JSON.stringify({
    live: fixture.liveStore,
    persisted: JSON.parse(fs.readFileSync(fixture.filePath, "utf8")),
  });
}
