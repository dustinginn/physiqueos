import { describe, expect, it } from "vitest";
import {
  PHASE5_API_COMPATIBILITY,
  PHASE5_AUTHENTICATION_SEQUENCE,
  PHASE5_REQUIRED_READINESS_GATES,
  PHASE5_SAFE_NEXT_LIFECYCLE,
  classifyCutoverFailure,
  evaluatePhase5Readiness,
} from "./phase5ReadinessPolicy.js";

describe("Phase 5 binary production-cutover policy", () => {
  it("blocks if any required gate is absent and is ready only when every gate is true", () => {
    expect(evaluatePhase5Readiness({}).classification).toBe("BLOCKED");
    const evidence = Object.fromEntries(PHASE5_REQUIRED_READINESS_GATES.map((gate) => [gate, true]));
    expect(evaluatePhase5Readiness(evidence)).toEqual({ classification: "READY", missing: [] });
    evidence.providerCommandParityPassed = false;
    expect(evaluatePhase5Readiness(evidence)).toMatchObject({ classification: "BLOCKED", missing: ["providerCommandParityPassed"] });
  });

  it("never treats a post-cutover PostgreSQL write as safely reversible to legacy JSON", () => {
    expect(classifyCutoverFailure("production-route-failure")).toBe("immediate-rollback");
    expect(classifyCutoverFailure("production-route-failure", { postgresqlWriteAccepted: true })).toBe("pause-forward-fix-or-reviewed-reconciliation");
    expect(classifyCutoverFailure("future-native-capability-failure")).toBe("disable-new-feature-no-canonical-rollback");
  });

  it("locks auth, API compatibility, and safe artifact lifecycle sequencing", () => {
    expect(PHASE5_AUTHENTICATION_SEQUENCE.indexOf("cut-web-to-postgresql-through-temporary-legacy-web-compatibility-principal")).toBeLessThan(PHASE5_AUTHENTICATION_SEQUENCE.indexOf("generate-one-time-founder-recovery-credential-at-enrollment"));
    expect(PHASE5_API_COMPATIBILITY).toMatchObject({ apiMajor: "v1", minimumSupportDays: 180, supportedAcceptedBuilds: 2, evolution: "additive" });
    expect(PHASE5_SAFE_NEXT_LIFECYCLE).toEqual([
      "stop-canonical-production-process", "build-and-preflight-intended-commit-in-isolation", "atomically-promote-accepted-artifact",
      "restart-canonical-production-process", "verify-routes-assets-build-identity-and-runtime-ownership",
    ]);
  });
});
