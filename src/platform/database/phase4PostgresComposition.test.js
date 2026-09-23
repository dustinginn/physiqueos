import { describe, expect, it } from "vitest";
import { addFounderNoncanonicalReadContext, createTransactionBoundPorts } from "./phase4PostgresComposition.js";

describe("Phase 4 provider application context", () => {
  it("composes the guarded workout-reconciliation resolution port for production transactions", () => {
    const ports = createTransactionBoundPorts({ now: () => new Date("2026-09-23T23:30:00.000Z") });
    expect(ports.resolveWorkoutReconciliation).toBeTypeOf("function");
  });

  it("preserves the migrated PostgreSQL application context without overlaying tracked Founder seed data", () => {
    const operatingRhythm = Object.freeze({ id: "migrated-rhythm", userId: "owner" });
    const canonicalRuntime = Object.freeze({ user: { id: "owner" }, goals: [], operatingRhythm, adaptiveTrustProfile: null, milestones: [] });
    const composed = addFounderNoncanonicalReadContext(canonicalRuntime, "owner");
    expect(composed).toBe(canonicalRuntime);
    expect(composed.operatingRhythm).toBe(operatingRhythm);
  });

  it("does not apply Founder-specific context to another owner", () => {
    const canonicalRuntime = Object.freeze({ user: { id: "another-user" }, goals: [] });
    expect(addFounderNoncanonicalReadContext(canonicalRuntime, "another-user")).toBe(canonicalRuntime);
  });
});
