import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const read = (name) =>
  fs.readFileSync(path.join(repositoryRoot, "scripts", name), "utf8");

describe("production cadence Node entrypoints", () => {
  it("use the Node-native resolver and contain no development runtime loader", () => {
    for (const name of [
      "runBriefingCadence.mjs",
      "statusBriefingCadence.mjs",
    ]) {
      const source = read(name);
      expect(source).toContain('from "node:module"');
      expect(source).toContain("sourceModuleResolutionHook.mjs");
      expect(source).not.toMatch(/tsx|ts-node|babel/i);
    }
    expect(read("monitorPhysiqueOS.ps1")).not.toMatch(/tsx/i);
  });

  it("executes the read-only diagnostic directly with production Node", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/statusBriefingCadence.mjs"],
      { cwd: repositoryRoot, encoding: "utf8", timeout: 30_000 }
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: "briefing_cadence_diagnostic_v1",
      readOnly: true,
      cadences: [
        { cadence: "midweek" },
        { cadence: "weekly" },
        { cadence: "monthly" },
      ],
    });
  });
});
