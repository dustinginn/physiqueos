import { describe, expect, it, vi } from "vitest";
import { createFeatureFlagEvaluator } from "../features/featureFlags";
import { readBuildIdentity } from "./buildIdentity";
import { createLivenessModel, createReadinessModel, createWorkerHeartbeat } from "./health";
import { createStructuredLogger, redactStructuredValue } from "./structuredLogger";

describe("foundation observability", () => {
  it("redacts credential, evidence, health, and object access fields recursively", () => {
    expect(redactStructuredValue({ token: "secret", nested: { evidencePayload: { private: true }, safe: "ok" }, authorization: "Bearer x" })).toEqual({ token: "[REDACTED]", nested: { evidencePayload: "[REDACTED]", safe: "ok" }, authorization: "[REDACTED]" });
  });

  it("writes structured build-correlated records without raw errors", () => {
    const sink = { warn: vi.fn() };
    const logger = createStructuredLogger({ sink, clock: () => new Date("2026-08-10T00:00:00Z"), buildIdentity: { buildId: "synthetic-build" } });
    logger.warn("synthetic.failed", { requestId: "request", error: new Error("private detail") });
    const record = JSON.parse(sink.warn.mock.calls[0][0]);
    expect(record).toMatchObject({ timestamp: "2026-08-10T00:00:00.000Z", event: "synthetic.failed", requestId: "request", error: { message: "[REDACTED]" } });
  });

  it("models immutable build, health, heartbeat, and fail-closed feature flags", () => {
    const build = readBuildIdentity({ npm_package_version: "1.2.3", PHYSIQUEOS_BUILD_ID: "build-1", PHYSIQUEOS_GIT_SHA: "abc" });
    expect(Object.isFrozen(build)).toBe(true);
    expect(createLivenessModel({ buildIdentity: build, startedAt: "now" })).toMatchObject({ status: "ok", buildId: "build-1" });
    expect(createReadinessModel({ buildIdentity: build, checks: [{ name: "database", ready: false }] }).status).toBe("not_ready");
    expect(createWorkerHeartbeat({ workerId: "worker", buildId: "build-1", observedAt: "now" })).toMatchObject({ status: "healthy" });
    const flags = createFeatureFlagEvaluator({ flags: [{ key: "native.health", enabled: true, platforms: ["ios"], minimumBuild: 10 }] });
    expect(flags.isEnabled("native.health", { platform: "ios", build: 10 })).toBe(true);
    expect(flags.isEnabled("native.health", { platform: "web", build: 10 })).toBe(false);
    expect(flags.isEnabled("missing", { platform: "ios", build: 10 })).toBe(false);
  });
});
