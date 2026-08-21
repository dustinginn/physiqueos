import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProductionCoordinatorAuthorizationProvider } from "./ProductionCoordinatorAuthorizationProvider.js";

describe("ProductionCoordinatorAuthorizationProvider", () => {
  it("loads one exact non-secret run/step/version-bound decision", async () => withRoot(async (root) => {
    const record = decision();
    await fs.writeFile(path.join(root, "founder-b-approval.json"), JSON.stringify(record), { flag: "wx" });
    const provider = createProductionCoordinatorAuthorizationProvider({ authorizationRoot: root });
    const expected = { ...record };
    delete expected.schemaVersion;
    await expect(provider.loadAuthorization({ authorizationRef: "founder-b-approval", runId: record.runId, step: "B", expectedCoordinatorVersion: 4 })).resolves.toEqual(expected);
  }));

  it("rejects traversal, wrong version, and unknown credential-like fields", async () => withRoot(async (root) => {
    const provider = createProductionCoordinatorAuthorizationProvider({ authorizationRoot: root });
    await expect(provider.loadAuthorization({ authorizationRef: "../approval", runId: "run", step: "B", expectedCoordinatorVersion: 4 })).rejects.toMatchObject({ code: "PHASE7B_AUTHORIZATION_REFERENCE_INVALID" });
    await fs.writeFile(path.join(root, "founder-b-approval.json"), JSON.stringify(decision()), { flag: "wx" });
    await expect(provider.loadAuthorization({ authorizationRef: "founder-b-approval", runId: decision().runId, step: "B", expectedCoordinatorVersion: 5 })).rejects.toMatchObject({ code: "PHASE7B_AUTHORIZATION_IDENTITY_MISMATCH" });
    await fs.writeFile(path.join(root, "founder-l-approval.json"), JSON.stringify({ ...decision(), step: "L", token: "forbidden" }), { flag: "wx" });
    await expect(provider.loadAuthorization({ authorizationRef: "founder-l-approval", runId: decision().runId, step: "L", expectedCoordinatorVersion: 4 })).rejects.toMatchObject({ code: "PHASE7B_AUTHORIZATION_RECORD_INVALID" });
  }));
});

function decision() { return { schemaVersion: 1, authorized: true, runId: "phase7b-isolated-run-1", step: "B", expectedCoordinatorVersion: 4, authorizationId: "founder-phase7b-b-approval", authorizedAt: "2026-08-21T06:00:00.000Z", expiresAt: "2026-08-21T06:10:00.000Z", priorStateDigest: "a".repeat(64) }; }
async function withRoot(run) { const root = await fs.mkdtemp(path.join(os.tmpdir(), "phase7b-approval-")); try { return await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); } }
