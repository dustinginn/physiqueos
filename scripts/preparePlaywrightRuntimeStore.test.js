import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveFounderRuntimeStorePath } from "../src/data/repositories/founderRuntimeStore";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

describe("Playwright runtime-store isolation", () => {
  it("rejects the live Founder store when Playwright mode is active", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-playwright-"));
    directories.push(cwd);
    expect(() => resolveFounderRuntimeStorePath({ cwd, env: { PHYSIQUEOS_PLAYWRIGHT: "1" } })).toThrow(/cannot use the live Founder runtime store/i);
  });

  it("accepts an isolated test store", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-playwright-"));
    directories.push(cwd);
    const resolved = resolveFounderRuntimeStorePath({ cwd, env: { PHYSIQUEOS_PLAYWRIGHT: "1", PHYSIQUEOS_RUNTIME_STORE_PATH: "private/founder/tmp/playwright/runtime-store.json" } });
    expect(resolved).toBe(path.resolve(cwd, "private/founder/tmp/playwright/runtime-store.json"));
  });
});
