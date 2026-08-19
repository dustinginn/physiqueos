import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve("infra/digitalocean/renderAppSpec.mjs");

// Dummy, syntactically-plausible values for every placeholder the product template requires, so a
// render attempt gets far enough to exercise the Founder-owner guard (and, in the accepting case,
// complete rendering) without ever touching a real credential or live service. Rendered output is
// streamed to stdout (PHYSIQUEOS_APP_SPEC_OUTPUT=-) rather than written to disk.
function productTemplateEnv(overrides = {}) {
  return {
    PATH: process.env.PATH,
    PHYSIQUEOS_APP_SPEC_VARIANT: "product",
    PHYSIQUEOS_APP_SPEC_OUTPUT: "-",
    BUILD_ID: "test-build-id",
    CANONICAL_OWNER_USER_ID: "phase5-synthetic-user",
    COMBINED_CUTOVER_PREPARE_CREDENTIAL_EXPIRES_AT: "2026-01-01T00:00:00.000Z",
    COMBINED_CUTOVER_PREPARE_CREDENTIAL_HASH: "test-hash",
    COMBINED_CUTOVER_PREPARE_ENABLED: "0",
    COMBINED_CUTOVER_PREPARE_OPERATION_ID: "test-operation",
    COMBINED_CUTOVER_TRANSFER_CREDENTIAL_EXPIRES_AT: "2026-01-01T00:00:00.000Z",
    COMBINED_CUTOVER_TRANSFER_CREDENTIAL_HASH: "test-hash",
    COMBINED_CUTOVER_TRANSFER_ENABLED: "0",
    COMBINED_CUTOVER_TRANSFER_OPERATION_ID: "test-operation",
    COMPATIBILITY_DATABASE_NAME: "physiqueos_phase5_test_provider_test",
    CREDENTIAL_PEPPER: "test-pepper",
    DATABASE_CA_CERT: "test-ca-cert",
    DIGITALOCEAN_REGION: "nyc3",
    GIT_BRANCH: "test-branch",
    GIT_REPOSITORY_URL: "https://example.invalid/test.git",
    GIT_SHA: "0000000000000000000000000000000000000",
    MIGRATION_OPERATION_ID: "test-operation",
    OPERATIONS_TOKEN: "test-token",
    PROVIDER_COMPATIBILITY_MODE: "1",
    PROVIDER_DATABASE_URL: "postgres://user:pass@127.0.0.1:1/db",
    PROVIDER_DEPLOYMENT_ID: "test-deployment",
    RUNTIME_AUTHORITY_ENVIRONMENT: "compatibility-test",
    SPACES_ACCESS_KEY_ID: "test-access-key",
    SPACES_BUCKET: "test-bucket",
    SPACES_ENDPOINT: "https://nyc3.digitaloceanspaces.invalid",
    SPACES_REGION: "nyc3",
    SPACES_SECRET_ACCESS_KEY: "test-secret",
    WORKER_ID: "test-worker",
    ACCESS_GATE_SECRET: "test-access-gate-secret",
    ...overrides,
  };
}

describe("renderAppSpec.mjs Founder-owner render guard", () => {
  it("refuses to render a provider-compatibility spec with a Founder-owner CANONICAL_OWNER_USER_ID", () => {
    expect(() =>
      execFileSync("node", [scriptPath], {
        env: productTemplateEnv({ CANONICAL_OWNER_USER_ID: "user_founder_001" }),
        stdio: ["ignore", "pipe", "pipe"],
      })
    ).toThrow();
  });

  it("reports the specific Founder-owner refusal reason on stderr, not a generic missing-variable error", () => {
    try {
      execFileSync("node", [scriptPath], {
        env: productTemplateEnv({ CANONICAL_OWNER_USER_ID: "user_founder_001" }),
        stdio: ["ignore", "pipe", "pipe"],
      });
      throw new Error("expected renderAppSpec.mjs to exit non-zero");
    } catch (error) {
      expect(String(error.stderr)).toContain("Refusing to render a provider-compatibility app spec with a Founder-owner CANONICAL_OWNER_USER_ID");
    }
  });

  it("still renders successfully for a non-Founder compatibility owner", () => {
    const output = execFileSync("node", [scriptPath], {
      env: productTemplateEnv({ CANONICAL_OWNER_USER_ID: "phase5-synthetic-user" }),
      stdio: ["ignore", "pipe", "pipe"],
    }).toString("utf8");
    expect(output).toContain("phase5-synthetic-user");
    expect(output).not.toContain("${");
  });

  it("does not apply the Founder-owner render guard when compatibility mode is off", () => {
    // PROVIDER_COMPATIBILITY_MODE=0 renders a full-runtime/production-shaped spec, where the real
    // Founder owner is legitimate and must not be rejected by this guard.
    const output = execFileSync("node", [scriptPath], {
      env: productTemplateEnv({ CANONICAL_OWNER_USER_ID: "user_founder_001", PROVIDER_COMPATIBILITY_MODE: "0" }),
      stdio: ["ignore", "pipe", "pipe"],
    }).toString("utf8");
    expect(output).toContain("user_founder_001");
  });
});
