import { describe, it, expect } from "vitest";
import {
  semanticReadModelProjection,
  readModelsSemanticallyEqual,
  compareRepresentativeReads,
} from "./productionMigrationEnvironmentAdapters.mjs";
import { createApplicationReadModel } from "../src/application/read-models/readModel.js";
import { createPhase3ReadModelService } from "../src/application/read-models/Phase3ReadModelService.js";

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
