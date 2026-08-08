import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreMutationLockService,
  FounderStoreMutationLockErrorCode } from "./FounderStoreMutationLock";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Founder-store cross-process mutation lock", () => {
  it("is exclusive, ownership-aware, metadata-complete, and releasable", async () => {
    const fixture = createFixture();
    const first = fixture.service.acquireSync({ operation: "phase_review_commit",
      goalId: "goal", decisionId: "decision", requestId: "request" });
    const inspection = fixture.service.inspect();
    expect(inspection).toMatchObject({ exists: true, valid: true,
      metadata: { operation: "phase_review_commit", goalId: "goal",
        decisionId: "decision", pid: process.pid, hostname: os.hostname() } });
    expect(fs.readFileSync(fixture.service.lockPath, "utf8")).not.toContain(first.token);
    await expect(fixture.service.acquire({ operation: "other", timeoutMs: 0 }))
      .rejects.toMatchObject({ code: FounderStoreMutationLockErrorCode.LIVE_OWNER });
    expect(() => fixture.service.releaseSync({ token: "wrong" }))
      .toThrow(expect.objectContaining({ code: FounderStoreMutationLockErrorCode.OWNERSHIP_MISMATCH }));
    fixture.service.releaseSync(first, { outcome: "committed", startingStoreRevision: 7,
      endingStoreRevision: 8 });
    expect(fixture.service.inspect().exists).toBe(false);
    const second = fixture.service.acquireSync({ operation: "next" });
    fixture.service.releaseSync(second);
    const diagnostics = JSON.parse(fs.readFileSync(fixture.service.diagnosticsPath, "utf8"));
    expect(diagnostics.entries.at(-1)).toMatchObject({ event: "released", operation: "next" });
    expect(Object.keys(fixture.service)).not.toContain("forceUnlock");
  });

  it("recovers only an expired same-host dead-PID lock with no commit temp", () => {
    const fixture = createFixture({ pid: 987654, isPidAlive: () => false,
      initialTime: "2026-08-15T18:00:00.000Z" });
    fixture.service.acquireSync({ operation: "crashed", maxHoldMs: 1000 });
    fixture.setTime("2026-08-15T18:00:02.000Z");
    const recovered = fixture.service.acquireSync({ operation: "recovered" });
    expect(recovered.metadata.operation).toBe("recovered");
    fixture.service.releaseSync(recovered);

    const blocked = createFixture({ pid: 987654, isPidAlive: () => false,
      initialTime: "2026-08-15T18:00:00.000Z" });
    blocked.service.acquireSync({ operation: "crashed", maxHoldMs: 1000 });
    blocked.setTime("2026-08-15T18:00:02.000Z");
    fs.writeFileSync(`${blocked.storePath}.999.commit.tmp`, "commit-in-progress");
    expect(() => blocked.service.acquireSync({ operation: "unsafe-recovery" }))
      .toThrow(expect.objectContaining({ code: FounderStoreMutationLockErrorCode.BUSY }));
  });

  it("never recovers a live PID or another host", () => {
    const live = createFixture({ pid: 1234, isPidAlive: () => true,
      initialTime: "2026-08-15T18:00:00.000Z" });
    live.service.acquireSync({ operation: "live", maxHoldMs: 1000 });
    live.setTime("2026-08-15T18:01:00.000Z");
    expect(() => live.service.acquireSync({ operation: "second" }))
      .toThrow(expect.objectContaining({ code: FounderStoreMutationLockErrorCode.LIVE_OWNER }));

    const other = createFixture({ hostname: "other-host", pid: 1234, isPidAlive: () => false,
      initialTime: "2026-08-15T18:00:00.000Z" });
    other.service.acquireSync({ operation: "remote", maxHoldMs: 1000 });
    other.setTime("2026-08-15T18:01:00.000Z");
    const local = createFounderStoreMutationLockService({ storePath: other.storePath,
      hostname: "local-host", isPidAlive: () => false,
      now: () => new Date("2026-08-15T18:01:00.000Z") });
    expect(() => local.acquireSync({ operation: "local" }))
      .toThrow(expect.objectContaining({ code: FounderStoreMutationLockErrorCode.OTHER_HOST }));
  });

  it("uses a bounded deterministic timeout", async () => {
    const fixture = createFixture();
    const held = fixture.service.acquireSync({ operation: "held" });
    const started = Date.now();
    await expect(fixture.service.acquire({ operation: "bounded", timeoutMs: 80 }))
      .rejects.toMatchObject({ code: FounderStoreMutationLockErrorCode.LIVE_OWNER });
    expect(Date.now() - started).toBeLessThan(500);
    fixture.service.releaseSync(held);
  });

  it("excludes a realistic second Node process and recovers after release", async () => {
    const fixture = createFixture();
    const helper = path.resolve("src/data/repositories/fixtures/holdFounderStoreMutationLock.mjs");
    const child = spawn(process.execPath, ["--import", "tsx", helper, fixture.storePath, "hold", "900"],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(child, "ACQUIRED");
    const contender = createFounderStoreMutationLockService({ storePath: fixture.storePath });
    await expect(contender.acquire({ operation: "subprocess-contender", timeoutMs: 100 }))
      .rejects.toMatchObject({ code: expect.stringMatching(/LOCK_(LIVE_OWNER|TIMEOUT)$/) });
    expect(await childExit(child)).toBe(0);
    const ownership = contender.acquireSync({ operation: "after-subprocess" });
    contender.releaseSync(ownership);
  }, 10_000);

  it("recovers a crashed subprocess only after its lease expires", async () => {
    const fixture = createFixture();
    const helper = path.resolve("src/data/repositories/fixtures/holdFounderStoreMutationLock.mjs");
    const child = spawn(process.execPath, ["--import", "tsx", helper, fixture.storePath, "crash", "250"],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(child, "ACQUIRED");
    expect(await childExit(child)).toBe(17);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const service = createFounderStoreMutationLockService({ storePath: fixture.storePath });
    const ownership = service.acquireSync({ operation: "post-crash-recovery" });
    service.releaseSync(ownership);
  }, 10_000);
});

function createFixture({ hostname = os.hostname(), pid = process.pid,
  isPidAlive, initialTime = "2026-08-15T18:00:00.000Z" } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "founder-store-lock-"));
  directories.push(directory);
  const storePath = path.join(directory, "runtime-store.json");
  fs.writeFileSync(storePath, JSON.stringify({ revision: 7 }));
  let currentTime = initialTime;
  const service = createFounderStoreMutationLockService({ storePath, hostname, pid,
    isPidAlive: isPidAlive ?? ((value) => value === process.pid),
    now: () => new Date(currentTime), defaultTimeoutMs: 50, retryIntervalMs: 10 });
  return { directory, storePath, service, setTime(value) { currentTime = value; } };
}
function waitForLine(child, expected) { return new Promise((resolve, reject) => {
  let output = "";
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expected}: ${output}`)), 5000);
  child.stdout.on("data", (chunk) => { output += chunk.toString(); if (output.includes(expected)) {
    clearTimeout(timer); resolve(output); } });
  child.on("error", reject);
}); }
function childExit(child) { return new Promise((resolve, reject) => {
  if (child.exitCode != null) { resolve(child.exitCode); return; }
  child.once("error", reject); child.once("exit", (code) => resolve(code));
}); }
