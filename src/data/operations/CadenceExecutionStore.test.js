import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCadenceExecutionLock,
  createCadenceExecutionStore,
} from "./CadenceExecutionStore";

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("cadence operational storage", () => {
  it("stores bounded evidence-free execution records outside Founder runtime data", async () => {
    const rootDirectory = temporary();
    const store = createCadenceExecutionStore({ rootDirectory });
    await store.record({
      executionId: "run:midweek",
      cadenceKey: "midweek",
      expectedArtifactId: "midweek-1",
      invokedAt: "2026-07-29T19:00:00.000Z",
      resultStatus: "generation_completed",
    });
    expect(await store.list()).toEqual([
      expect.objectContaining({
        executionId: "run:midweek",
        resultStatus: "generation_completed",
      }),
    ]);
    expect(fs.existsSync(path.join(rootDirectory, "briefing-cadence.log"))).toBe(true);
    expect(fs.existsSync(path.join(rootDirectory, "runtime-store.json"))).toBe(false);
  });

  it("allows one executor and recovers a stale filesystem lock", async () => {
    const rootDirectory = temporary();
    let current = new Date("2026-07-29T19:00:00.000Z");
    const lock = createCadenceExecutionLock({
      rootDirectory,
      now: () => current,
      staleAfterMs: 1000,
    });
    const first = await lock.acquire({ executionId: "first" });
    expect(first.acquired).toBe(true);
    expect((await lock.acquire({ executionId: "second" })).acquired).toBe(false);
    current = new Date("2026-07-29T19:00:02.000Z");
    const stale = await lock.acquire({ executionId: "third" });
    expect(stale).toMatchObject({
      acquired: true,
      reason: "stale_lock_recovered",
    });
    await stale.release();
  });
});

function temporary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cadence-store-"));
  directories.push(directory);
  return directory;
}
