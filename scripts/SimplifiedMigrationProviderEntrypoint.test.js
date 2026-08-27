import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("simplified provider migration entrypoint wiring", () => {
  it("is included only in the provider worker and rejects a local process before provider access", () => {
    const dockerfile = fs.readFileSync("Dockerfile.provider-worker", "utf8");
    const collector = fs.readFileSync("scripts/collectProviderWorkerArtifact.mjs", "utf8");
    expect(dockerfile).toContain("scripts/runSimplifiedProviderMigration.mjs");
    expect(collector).toContain('"scripts/runSimplifiedProviderMigration.mjs"');
    const result = spawnSync(process.execPath, ["scripts/runSimplifiedProviderMigration.mjs", "--phase", "pre-import"], { encoding: "utf8", env: { ...process.env, PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED: "0" } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DigitalOcean App Platform full-runtime boundary");
  });

  it("does not expose the first-write transition or any WP2-C receipt dependency", () => {
    const source = fs.readFileSync("scripts/runSimplifiedProviderMigration.mjs", "utf8");
    expect(source).not.toContain("RECORD_FIRST_PROVIDER_WRITE");
    expect(source).not.toContain("preparationStore");
    expect(source).not.toContain("WP2-C");
  });
});
