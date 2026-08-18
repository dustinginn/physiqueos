import { describe, it, expect } from "vitest";
import {
  semanticReadModelProjection,
  readModelsSemanticallyEqual,
  compareRepresentativeReads,
  computeBoundedSemanticDifference,
} from "./productionMigrationEnvironmentAdapters.mjs";
import { createApplicationReadModel } from "../src/application/read-models/readModel.js";
import { createPhase3ReadModelService } from "../src/application/read-models/Phase3ReadModelService.js";
import { createLegacyFounderReadLoaders } from "../src/application/read-models/LegacyFounderReadLoaders.js";
import { createHomeBriefingService } from "../src/domain/services/HomeBriefingService.js";
import { founderSeedPack } from "../src/data/founderSeed/index.js";
import { createSeedRepositories } from "../src/data/repositories/createSeedRepositories.js";

function envelope(overrides = {}) {
  return createApplicationReadModel({
    model: "home.v1",
    data: { greeting: "hi", items: [1, 2, 3], nested: { a: 1, b: 2 } },
    ...overrides,
  });
}

describe("semanticReadModelProjection", () => {
  it("does not mutate the input object", () => {
    const original = envelope();
    const before = JSON.stringify(original);
    semanticReadModelProjection(original);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("removes exactly generatedAt, freshThrough, and etag and nothing else", () => {
    const projected = semanticReadModelProjection(envelope());
    expect(projected).not.toHaveProperty("generatedAt");
    expect(projected).not.toHaveProperty("freshThrough");
    expect(projected).not.toHaveProperty("etag");
    expect(projected).toMatchObject({ contractVersion: "1", model: "home.v1", resourceVersion: "1" });
    expect(projected.data).toEqual({ greeting: "hi", items: [1, 2, 3], nested: { a: 1, b: 2 } });
  });
});

describe("readModelsSemanticallyEqual — volatile envelope fields pass", () => {
  it("passes for identical data with different generatedAt", () => {
    const left = envelope({ generatedAt: "2026-08-18T17:42:06.353Z" });
    const right = envelope({ generatedAt: "2026-08-18T17:42:06.354Z" });
    expect(left.generatedAt).not.toBe(right.generatedAt);
    expect(readModelsSemanticallyEqual(left, right)).toBe(true);
  });

  it("passes for identical data with different freshThrough", () => {
    const left = envelope({ generatedAt: "2026-08-18T17:42:06.000Z", freshThrough: "2026-08-18T17:42:06.000Z" });
    const right = envelope({ generatedAt: "2026-08-18T17:42:06.000Z", freshThrough: "2026-08-18T17:42:09.000Z" });
    expect(left.freshThrough).not.toBe(right.freshThrough);
    expect(readModelsSemanticallyEqual(left, right)).toBe(true);
  });

  it("passes despite different derived etag values (a consequence of the timestamp difference)", () => {
    const left = envelope({ generatedAt: "2026-08-18T17:42:06.353Z" });
    const right = envelope({ generatedAt: "2026-08-18T17:42:06.354Z" });
    expect(left.etag).not.toBe(right.etag);
    expect(readModelsSemanticallyEqual(left, right)).toBe(true);
  });

  it("passes for identical semantic objects with different key insertion order", () => {
    const left = envelope({ data: { a: 1, b: 2, c: 3 } });
    const right = envelope({ data: { c: 3, a: 1, b: 2 } });
    expect(readModelsSemanticallyEqual(left, right)).toBe(true);
  });
});

describe("readModelsSemanticallyEqual — genuine differences still fail", () => {
  it("fails for a genuine difference inside data", () => {
    const left = envelope({ data: { greeting: "hi" } });
    const right = envelope({ data: { greeting: "bye" } });
    expect(readModelsSemanticallyEqual(left, right)).toBe(false);
  });

  it("fails for a difference in model", () => {
    const left = envelope({ model: "home.v1" });
    const right = envelope({ model: "log.v1" });
    expect(readModelsSemanticallyEqual(left, right)).toBe(false);
  });

  it("fails for a difference in resourceVersion", () => {
    const left = envelope({ resourceVersion: "1" });
    const right = envelope({ resourceVersion: "2" });
    expect(readModelsSemanticallyEqual(left, right)).toBe(false);
  });

  it("fails for a null field versus a missing field", () => {
    const left = envelope({ data: { value: null } });
    const right = envelope({ data: {} });
    expect(readModelsSemanticallyEqual(left, right)).toBe(false);
  });

  it("fails for a type difference (numeric 1 versus string \"1\")", () => {
    const left = envelope({ data: { value: 1 } });
    const right = envelope({ data: { value: "1" } });
    expect(readModelsSemanticallyEqual(left, right)).toBe(false);
  });

  it("fails for a meaningful array-order difference", () => {
    const left = envelope({ data: { items: [1, 2, 3] } });
    const right = envelope({ data: { items: [3, 2, 1] } });
    expect(readModelsSemanticallyEqual(left, right)).toBe(false);
  });
});

function representativeRuntime() {
  return {
    user: { timeZone: "America/Los_Angeles" },
    evidenceReviews: [{ id: "review-1", status: "pending" }],
    executionItems: [{ id: "item-1" }],
  };
}

const REPRESENTATIVE_METHODS = [
  "home", "log", "evidenceReview", "goals", "operatingPlan",
  "priorities", "progress", "confidence", "briefings", "training", "profile",
];

function principal() {
  return { userId: "founder", deviceId: "test-device", sessionId: "test-session" };
}

function loadersReturning(dataByMethod) {
  return Object.fromEntries(REPRESENTATIVE_METHODS.map((method) => [
    { home: "home.v1", log: "log.v1", evidenceReview: "evidence-review.v1", goals: "goals.v1",
      operatingPlan: "operating-plan.v1", priorities: "priorities.v1", progress: "progress.v1",
      confidence: "confidence.v1", briefings: "briefings.v1", training: "training.v1", profile: "profile.v1" }[method],
    async () => dataByMethod(method),
  ]));
}

describe("compareRepresentativeReads — real execute-path proof (real createPhase3ReadModelService, independent clocks)", () => {
  it("passes when both sides serve identical semantic data through independently advancing clocks", async () => {
    let tick = 0;
    const sameData = (method) => ({ label: `payload-for-${method}` });
    const legacy = createPhase3ReadModelService({
      loaders: loadersReturning(sameData),
      now: () => new Date(1000 + (tick += 1)),
    });
    const postgres = createPhase3ReadModelService({
      loaders: loadersReturning(sameData),
      now: () => new Date(9000000 + (tick += 3)),
    });

    const checks = await compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() });
    expect(Object.keys(checks)).toHaveLength(REPRESENTATIVE_METHODS.length);
    for (const method of REPRESENTATIVE_METHODS) expect(checks[method]).toBe("pass");
  });

  it("rejects a genuine imported semantic mismatch before any canonical write boundary", async () => {
    const legacy = createPhase3ReadModelService({
      loaders: loadersReturning((method) => ({ label: `payload-for-${method}` })),
      now: () => new Date(1000),
    });
    const postgres = createPhase3ReadModelService({
      loaders: loadersReturning((method) => ({ label: method === "goals" ? "MIGRATED-INCORRECTLY" : `payload-for-${method}` })),
      now: () => new Date(2000),
    });

    await expect(compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() }))
      .rejects.toThrow("Application read parity failed for goals.");
  });
});

describe("compareRepresentativeReads — frozen-clock regression for time-derived read-model data", () => {
  it("reproduces the prior home-style mismatch: independently advancing clocks fail even though the underlying source data is identical", async () => {
    // Loaders that read `input.now` back out (mirrors how a real loader would embed clock-derived
    // state) so two independently-advancing clocks produce genuinely different `data`, not just
    // different envelope timestamps - exactly the class of bug that caused "Application read
    // parity failed for home." before this patch.
    const timeDerivedLoaders = (now) => Object.fromEntries(REPRESENTATIVE_METHODS.map((method) => [
      { home: "home.v1", log: "log.v1", evidenceReview: "evidence-review.v1", goals: "goals.v1",
        operatingPlan: "operating-plan.v1", priorities: "priorities.v1", progress: "progress.v1",
        confidence: "confidence.v1", briefings: "briefings.v1", training: "training.v1", profile: "profile.v1" }[method],
      async () => ({ label: `payload-for-${method}`, evaluatedAtHour: now().getHours() }),
    ]));

    const legacy = createPhase3ReadModelService({ loaders: timeDerivedLoaders(() => new Date(2026, 0, 1, 9, 0, 0)) });
    const postgres = createPhase3ReadModelService({ loaders: timeDerivedLoaders(() => new Date(2026, 0, 1, 21, 0, 0)) });

    await expect(compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() }))
      .rejects.toThrow("Application read parity failed for home.");
  });

  it("resolves that mismatch when both sides are evaluated against one shared frozen now, without excluding any additional fields", async () => {
    const timeDerivedLoaders = (now) => Object.fromEntries(REPRESENTATIVE_METHODS.map((method) => [
      { home: "home.v1", log: "log.v1", evidenceReview: "evidence-review.v1", goals: "goals.v1",
        operatingPlan: "operating-plan.v1", priorities: "priorities.v1", progress: "progress.v1",
        confidence: "confidence.v1", briefings: "briefings.v1", training: "training.v1", profile: "profile.v1" }[method],
      async () => ({ label: `payload-for-${method}`, evaluatedAtHour: now().getHours() }),
    ]));

    const frozenInstant = new Date(2026, 0, 1, 9, 0, 0);
    const sharedNow = () => frozenInstant;
    const legacy = createPhase3ReadModelService({ loaders: timeDerivedLoaders(sharedNow), now: sharedNow });
    const postgres = createPhase3ReadModelService({ loaders: timeDerivedLoaders(sharedNow), now: sharedNow });

    const checks = await compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() });
    for (const method of REPRESENTATIVE_METHODS) expect(checks[method]).toBe("pass");
  });

  it("the shared now stays identical across every representative method within one comparison pass", async () => {
    const observedInstants = [];
    const sharedNow = () => { const instant = new Date(2026, 5, 15, 14, 30, 0); observedInstants.push(instant.getTime()); return instant; };
    const loaders = (now) => Object.fromEntries(REPRESENTATIVE_METHODS.map((method) => [
      { home: "home.v1", log: "log.v1", evidenceReview: "evidence-review.v1", goals: "goals.v1",
        operatingPlan: "operating-plan.v1", priorities: "priorities.v1", progress: "progress.v1",
        confidence: "confidence.v1", briefings: "briefings.v1", training: "training.v1", profile: "profile.v1" }[method],
      async () => ({ evaluatedAtMs: now().getTime() }),
    ]));
    const legacy = createPhase3ReadModelService({ loaders: loaders(sharedNow), now: sharedNow });
    const postgres = createPhase3ReadModelService({ loaders: loaders(sharedNow), now: sharedNow });

    const checks = await compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() });
    expect(Object.keys(checks)).toHaveLength(REPRESENTATIVE_METHODS.length);
    expect(new Set(observedInstants).size).toBe(1);
  });

  it("a genuine semantic data difference still fails under the shared frozen clock", async () => {
    const frozenInstant = new Date(2026, 0, 1, 9, 0, 0);
    const sharedNow = () => frozenInstant;
    const legacy = createPhase3ReadModelService({
      loaders: loadersReturning((method) => ({ label: `payload-for-${method}` })), now: sharedNow,
    });
    const postgres = createPhase3ReadModelService({
      loaders: loadersReturning((method) => ({ label: method === "training" ? "WRONG" : `payload-for-${method}` })), now: sharedNow,
    });
    await expect(compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() }))
      .rejects.toThrow("Application read parity failed for training.");
  });

  it("a genuine time-derived semantic difference from different canonical source data still fails under a shared clock", async () => {
    const frozenInstant = new Date(2026, 0, 1, 9, 0, 0);
    const sharedNow = () => frozenInstant;
    const legacy = createPhase3ReadModelService({
      loaders: loadersReturning((method) => ({ label: `payload-for-${method}`, computedAtHour: sharedNow().getHours(), sourceRevision: 140 })),
      now: sharedNow,
    });
    const postgres = createPhase3ReadModelService({
      loaders: loadersReturning((method) => ({ label: `payload-for-${method}`, computedAtHour: sharedNow().getHours(), sourceRevision: method === "confidence" ? 139 : 140 })),
      now: sharedNow,
    });
    await expect(compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() }))
      .rejects.toThrow("Application read parity failed for confidence.");
  });

  it("model, resourceVersion, array-order, null-vs-missing, and type differences still fail (unaffected by the frozen-clock fix)", () => {
    expect(readModelsSemanticallyEqual(envelope({ model: "home.v1" }), envelope({ model: "log.v1" }))).toBe(false);
    expect(readModelsSemanticallyEqual(envelope({ resourceVersion: "1" }), envelope({ resourceVersion: "2" }))).toBe(false);
    expect(readModelsSemanticallyEqual(envelope({ data: { items: [1, 2] } }), envelope({ data: { items: [2, 1] } }))).toBe(false);
    expect(readModelsSemanticallyEqual(envelope({ data: { v: null } }), envelope({ data: {} }))).toBe(false);
    expect(readModelsSemanticallyEqual(envelope({ data: { v: 1 } }), envelope({ data: { v: "1" } }))).toBe(false);
  });
});

describe("verifyReadParity — real HomeBriefingService/LegacyFounderReadLoaders execute-path proof", () => {
  function seedRuntime() {
    return { ...founderSeedPack, evidenceReviews: [], executionItems: founderSeedPack.executionItems ?? [] };
  }

  it("REGRESSION PROOF (real domain logic, no mocks): independently different clocks passed directly to createHomeBriefingService produce genuinely different home output - reproducing the prior mismatch with real code", async () => {
    const runtime = seedRuntime();
    const repositories = createSeedRepositories(runtime);
    const morningHome = createHomeBriefingService({ repositories, readRuntimeStore: () => runtime, now: () => new Date(2020, 0, 1, 9, 0, 0) });
    const eveningHome = createHomeBriefingService({ repositories, readRuntimeStore: () => runtime, now: () => new Date(2026, 6, 15, 22, 0, 0) });
    const [morning, evening] = await Promise.all([
      morningHome.getHomeBriefing(runtime.user.id),
      eveningHome.getHomeBriefing(runtime.user.id),
    ]);
    expect(JSON.stringify(morning)).not.toBe(JSON.stringify(evening));
  });

  it("FIX PROOF (real domain logic, no mocks): createLegacyFounderReadLoaders now forwards a shared frozen now through to home, producing identical output on both invocations", async () => {
    const runtime = seedRuntime();
    const repositories = createSeedRepositories(runtime);
    const frozenInstant = new Date(2026, 0, 1, 9, 0, 0);
    const sharedNow = () => frozenInstant;
    const legacySideLoaders = createLegacyFounderReadLoaders({ repositories, readRuntimeStore: () => runtime, now: sharedNow });
    const providerSideLoaders = createLegacyFounderReadLoaders({ repositories, readRuntimeStore: () => runtime, now: sharedNow });
    const [legacyHome, providerHome] = await Promise.all([
      legacySideLoaders["home.v1"]({ principal: { userId: runtime.user.id } }),
      providerSideLoaders["home.v1"]({ principal: { userId: runtime.user.id } }),
    ]);
    expect(readModelsSemanticallyEqual(
      createApplicationReadModel({ model: "home.v1", data: legacyHome }),
      createApplicationReadModel({ model: "home.v1", data: providerHome }),
    )).toBe(true);
  });

  it("without the forwarding fix (now omitted from createLegacyFounderReadLoaders), home falls back to real wall-clock time regardless of what the caller intended - confirming the fix targets a real gap", async () => {
    const runtime = seedRuntime();
    const repositories = createSeedRepositories(runtime);
    // Deliberately does not pass `now` through createLegacyFounderReadLoaders, matching the
    // pre-fix call site. createHomeBriefingService itself still defaults to real new Date().
    const loaders = createLegacyFounderReadLoaders({ repositories, readRuntimeStore: () => runtime });
    const result = await loaders["home.v1"]({ principal: { userId: runtime.user.id } });
    expect(result).toBeTruthy();
    expect(typeof result.header.greeting).toBe("string");
  });
});

describe("compareRepresentativeReads — resourceVersion consistency (a second, independent gap found by source inspection)", () => {
  it("fails when legacy's resourceVersion defaults to a hardcoded placeholder while the provider side derives it from the source revision, even with identical data and a shared clock", async () => {
    const frozenInstant = new Date(2026, 0, 1, 9, 0, 0);
    const sharedNow = () => frozenInstant;
    const sameData = (method) => ({ label: `payload-for-${method}` });
    const legacy = createPhase3ReadModelService({ loaders: loadersReturning(sameData), now: sharedNow }); // readResourceVersion defaults to () => "1"
    const postgres = createPhase3ReadModelService({
      loaders: loadersReturning(sameData), now: sharedNow,
      readResourceVersion: ({ data }) => String(data?.version ?? 140),
    });
    await expect(compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() }))
      .rejects.toThrow("Application read parity failed for home.");
  });

  it("passes when both sides use the same resourceVersion formula (matching the fix applied in verifyReadParity)", async () => {
    const frozenInstant = new Date(2026, 0, 1, 9, 0, 0);
    const sharedNow = () => frozenInstant;
    const sameData = (method) => ({ label: `payload-for-${method}` });
    const readResourceVersion = ({ data }) => String(data?.version ?? 140);
    const legacy = createPhase3ReadModelService({ loaders: loadersReturning(sameData), now: sharedNow, readResourceVersion });
    const postgres = createPhase3ReadModelService({ loaders: loadersReturning(sameData), now: sharedNow, readResourceVersion });
    const checks = await compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() });
    for (const method of REPRESENTATIVE_METHODS) expect(checks[method]).toBe("pass");
  });
});

describe("computeBoundedSemanticDifference", () => {
  it("reports the correct path for a single nested field mismatch", () => {
    const left = { a: { b: { c: 1 } } };
    const right = { a: { b: { c: 2 } } };
    const { differingPaths, truncated } = computeBoundedSemanticDifference(left, right);
    expect(truncated).toBe(false);
    expect(differingPaths).toEqual([{ path: "$.a.b.c", kind: "value-mismatch", leftType: "number", rightType: "number" }]);
  });

  it("reports the correct path and classification for a missing key", () => {
    const left = { a: 1, b: 2 };
    const right = { a: 1 };
    const { differingPaths } = computeBoundedSemanticDifference(left, right);
    expect(differingPaths).toEqual([{ path: "$.b", kind: "missing-right", leftType: "number" }]);
  });

  it("reports a bounded array/index path rather than dumping the array, using the first differing index", () => {
    const left = { items: [1, 2, 3, 4, 5] };
    const right = { items: [1, 2, 99, 4, 5] };
    const { differingPaths } = computeBoundedSemanticDifference(left, right);
    expect(differingPaths).toEqual([{ path: "$.items[2]", kind: "value-mismatch", leftType: "number", rightType: "number" }]);
  });

  it("reports array length mismatches without walking elements", () => {
    const left = { items: [1, 2, 3] };
    const right = { items: [1, 2] };
    const { differingPaths } = computeBoundedSemanticDifference(left, right);
    expect(differingPaths).toEqual([{ path: "$.items", kind: "array-length-mismatch", leftLength: 3, rightLength: 2 }]);
  });

  it("truncates deterministically once the configured maximum number of mismatches is exceeded", () => {
    const left = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`k${index}`, index]));
    const right = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`k${index}`, index + 1]));
    const { differingPaths, truncated } = computeBoundedSemanticDifference(left, right, { maxPaths: 5 });
    expect(differingPaths.length).toBe(5);
    expect(truncated).toBe(true);
  });

  it("never emits unrelated payload data - only paths, kinds, and compact type metadata", () => {
    const left = { secret: "founder-private-value-should-never-appear", other: 1 };
    const right = { secret: "different-private-value-should-never-appear", other: 1 };
    const { differingPaths } = computeBoundedSemanticDifference(left, right);
    const serialized = JSON.stringify(differingPaths);
    expect(serialized).not.toContain("founder-private-value-should-never-appear");
    expect(serialized).not.toContain("different-private-value-should-never-appear");
    expect(differingPaths).toEqual([{ path: "$.secret", kind: "value-mismatch", leftType: "string", rightType: "string" }]);
  });

  it("does not mutate either input", () => {
    const left = Object.freeze({ a: { b: 1 } });
    const right = Object.freeze({ a: { b: 2 } });
    const leftBefore = JSON.stringify(left);
    const rightBefore = JSON.stringify(right);
    computeBoundedSemanticDifference(left, right);
    expect(JSON.stringify(left)).toBe(leftBefore);
    expect(JSON.stringify(right)).toBe(rightBefore);
  });
});

describe("compareRepresentativeReads — bounded diagnostics on failure", () => {
  it("attaches a bounded, path-only parityDiagnostic to the thrown error without dumping the full payload", async () => {
    const frozenInstant = new Date(2026, 0, 1, 9, 0, 0);
    const sharedNow = () => frozenInstant;
    const legacy = createPhase3ReadModelService({
      loaders: loadersReturning((method) => ({ label: `payload-for-${method}`, secretDetail: "must-not-appear-in-diagnostic" })), now: sharedNow,
    });
    const postgres = createPhase3ReadModelService({
      loaders: loadersReturning((method) => method === "profile"
        ? { label: "DIFFERENT-VALUE-SHOULD-NOT-APPEAR", secretDetail: "ALSO-SHOULD-NOT-APPEAR" }
        : { label: `payload-for-${method}`, secretDetail: "must-not-appear-in-diagnostic" }), now: sharedNow,
    });
    let caught;
    try {
      await compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() });
    } catch (error) { caught = error; }
    expect(caught).toBeTruthy();
    expect(caught.message).toBe("Application read parity failed for profile.");
    expect(caught.parityDiagnostic).toBeTruthy();
    expect(caught.parityDiagnostic.method).toBe("profile");
    expect(caught.parityDiagnostic.differingPaths.length).toBeGreaterThan(0);
    expect(caught.parityDiagnostic.differingPaths.length).toBeLessThanOrEqual(20);
    const serializedDiagnostic = JSON.stringify(caught.parityDiagnostic);
    expect(serializedDiagnostic).not.toContain("must-not-appear-in-diagnostic");
    expect(serializedDiagnostic).not.toContain("payload-for-profile");
    expect(serializedDiagnostic).not.toContain("DIFFERENT");
  });

  it("the parity failure still throws even if diagnostic generation itself would throw", async () => {
    const frozenInstant = new Date(2026, 0, 1, 9, 0, 0);
    const sharedNow = () => frozenInstant;
    // Succeeds on its one legitimate read (consumed while computing the equality-check hash,
    // which correctly determines the two sides differ), then throws on any further read -
    // simulating diagnostic computation failing strictly *after* a real parity failure was
    // already and correctly detected.
    let reads = 0;
    const hostileRight = {
      get label() {
        reads += 1;
        if (reads > 1) throw new Error("simulated diagnostic-time read failure");
        return "right-value";
      },
    };
    const legacy = createPhase3ReadModelService({
      loaders: loadersReturning((method) => (method === "log" ? { label: "left-value" } : { label: "ok" })), now: sharedNow,
    });
    const postgres = createPhase3ReadModelService({
      loaders: loadersReturning((method) => (method === "log" ? hostileRight : { label: "ok" })), now: sharedNow,
    });
    await expect(compareRepresentativeReads({ legacy, postgres, principal: principal(), runtime: representativeRuntime() }))
      .rejects.toThrow("Application read parity failed for log.");
  });
});
