import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migration = require("./000005_combined_runtime_authority.cjs");

describe("combined runtime-authority migration", () => {
  it("persists an explicit non-authoritative compatibility authority and worker scope", () => {
    expect(migration.UP_SQL).toContain("provider-compatibility-nonauthoritative");
    expect(migration.UP_SQL).toContain("'compatibility'");
    expect(migration.UP_SQL).toContain("canonical_runtime_metadata");
    expect(migration.UP_SQL).toContain("canonical_application_context");
  });
});
