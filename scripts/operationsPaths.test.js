import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLogPair, operationsPaths, safeOperationsTimestamp } from "./operationsPaths.mjs";
import { selectOperationLogsForCleanup } from "./cleanupOperationsLogs.mjs";

describe("Founder operations paths", () => {
  it("uses Windows-safe timestamps and category directories", () => {
    expect(safeOperationsTimestamp(new Date("2026-07-15T03:46:51.703Z"))).toBe("2026-07-15T03-46-51-703Z");
    const pair = createLogPair("controlled restart", "serverLogs", new Date("2026-07-15T03:46:51.703Z"));
    expect(pair.stdout).toBe(path.join(operationsPaths.serverLogs, "controlled-restart-2026-07-15T03-46-51-703Z.out.log"));
    expect(pair.stderr.endsWith(".err.log")).toBe(true);
  });

  it("selects generated logs deterministically without entering backups or incident recovery", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-ops-"));
    try {
      ["a.log", "b.log", "notes.txt"].forEach((name, index) => {
        const file = path.join(directory, name); fs.writeFileSync(file, name); fs.utimesSync(file, index + 1, index + 1);
      });
      const directories = Object.fromEntries(Object.keys(operationsPaths).map((key) => [key, path.join(directory, "missing", key)]));
      directories.serverLogs = directory;
      const selected = selectOperationLogsForCleanup({ directories, now: 100000, retain: 1 });
      expect(selected.map((item) => item.name)).toEqual(["a.log"]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
