import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  discoverControlPlaneAuthority,
  parseDoctorArguments,
  runConsoleDoctor,
  runLocalDoctor,
} from "./productionAccessDoctor.mjs";

const SHA = "b7eb1e397f0238df9ae904fd182ddbb51602e8d8";
const CONTEXT = "physiqueos-final-cutover-config";
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("production access doctor arguments", () => {
  it("requires expected authority for network modes and rejects other contexts", () => {
    assert.equal(parseDoctorArguments(["local"]).context, CONTEXT);
    assert.equal(parseDoctorArguments(["control-plane", "--expected-sha", SHA]).expectedSha, SHA);
    assert.equal(parseDoctorArguments(["console", "--expected-sha", SHA, "--structural-diagnostics"]).structuralDiagnostics, true);
    assert.throws(() => parseDoctorArguments(["console"]), { code: "DOCTOR_EXPECTED_SHA_REQUIRED" });
    assert.throws(() => parseDoctorArguments(["local", "--context", "physiqueos-production-deploy"]), { code: "DOCTL_CONTEXT_NOT_APPROVED" });
    assert.throws(() => parseDoctorArguments(["local", "--structural-diagnostics"]), { code: "DOCTOR_DIAGNOSTICS_MODE_INVALID" });
  });
});

describe("local doctor", () => {
  it("checks a supported host, tracked clean tools, owner-only config, and exact context without returning a token", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-local-doctor-test-"));
    temporaryDirectories.push(root);
    fs.writeFileSync(path.join(root, ".git"), "gitdir: synthetic\n");
    fs.writeFileSync(path.join(root, "package.json"), "{}\n");
    for (const relative of [
      "scripts/operations/productionAccessDoctor.mjs",
      "scripts/operations/productionAccessSafety.mjs",
      "scripts/operations/runAppConsoleContextGzipFile.mjs",
      "scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs",
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), `${relative}\n`);
    }
    const configPath = path.join(root, "config.yaml");
    fs.writeFileSync(configPath, `auth-contexts:\n  ${CONTEXT}: synthetic_token_value_long_enough_123\n`, { mode: 0o600 });
    const result = runLocalDoctor({
      root,
      configPath,
      platform: "darwin",
      arch: "arm64",
      currentUid: fs.statSync(configPath).uid,
      resolveDependency: () => "/synthetic/js-yaml",
      execFileSyncImpl: (command, args) => {
        if (command === "git" && args[0] === "ls-files") return `${args.at(-1)}\n`;
        if (command === "git" && args[0] === "status") return "";
        if (command === "git" && args[0] === "rev-parse") return `${SHA}\n`;
        if (command === "git") return "git version 2.50.0\n";
        if (command === "doctl") return "doctl version 1.168.0-release\n";
        throw new Error("unexpected command");
      },
    });
    assert.equal(result.passed, true);
    assert.equal(result.credential.contextPresent, true);
    assert.equal(JSON.stringify(result).includes("synthetic_token"), false);
  });
});

describe("control-plane doctor", () => {
  it("returns only sanitized stable authority for matching Web, worker, and public health", async () => {
    const result = await discoverControlPlaneAuthority({
      token: "synthetic_token_never_printed",
      expectedSha: SHA,
      fetchImpl: successfulFetch(),
    });
    assert.equal(result.passed, true);
    assert.equal(result.components.web.sourceSha, SHA);
    assert.equal(JSON.stringify(result).includes("synthetic_token"), false);
  });

  it("fails closed on 403, deployment transition, or source mismatch", async () => {
    await assert.rejects(discoverControlPlaneAuthority({ token: "x", expectedSha: SHA, fetchImpl: async () => response(403, {}) }),
      { code: "DOCTOR_CONTROL_PLANE_HTTP_403" });
    const transitional = successfulFetch({ inProgress: { id: "pending" } });
    await assert.rejects(discoverControlPlaneAuthority({ token: "x", expectedSha: SHA, fetchImpl: transitional }),
      { code: "DOCTOR_DEPLOYMENT_TRANSITIONAL" });
    await assert.rejects(discoverControlPlaneAuthority({ token: "x", expectedSha: "a".repeat(40), fetchImpl: successfulFetch() }),
      { code: "DOCTOR_SOURCE_AUTHORITY_MISMATCH" });
  });
});

describe("console doctor", () => {
  it("requires the exact sanitized zero-data report and stable post-check", async () => {
    let checks = 0;
    const authority = controlPlaneResult();
    const result = await runConsoleDoctor({
      expectedSha: SHA,
      controlPlaneDoctor: async () => { checks += 1; return authority; },
      primaryRunner: async ({ args, stdout }) => {
        assert.equal(args[0], CONTEXT);
        stdout.write(doctorFrame({ databaseUrl: true, deploymentNoise: true }));
      },
    });
    assert.equal(checks, 2);
    assert.equal(result.transaction.rolledBack, true);
    assert.equal(result.postCheckStable, true);
  });

  it("fails on a missing binding or changed post-console deployment", async () => {
    const authority = controlPlaneResult();
    await assert.rejects(runConsoleDoctor({
      expectedSha: SHA,
      controlPlaneDoctor: async () => authority,
      primaryRunner: async ({ stdout }) => {
        stdout.write(doctorFrame({ databaseUrl: false }));
      },
    }), { code: "DOCTOR_CONSOLE_REPORT_INVALID" });

    let checks = 0;
    await assert.rejects(runConsoleDoctor({
      expectedSha: SHA,
      controlPlaneDoctor: async () => {
        checks += 1;
        return checks === 1 ? authority : { ...authority, deployment: { ...authority.deployment, id: "changed" } };
      },
      primaryRunner: async ({ stdout }) => {
        stdout.write(doctorFrame({ databaseUrl: true }));
      },
    }), { code: "DOCTOR_POST_CONSOLE_AUTHORITY_DRIFT" });
  });

  it("attaches only structural diagnostics when explicitly requested", async () => {
    const failure = await runConsoleDoctor({
      expectedSha: SHA,
      structuralDiagnostics: true,
      controlPlaneDoctor: async () => controlPlaneResult(),
      primaryRunner: async ({ stdout }) => { stdout.write(`${doctorMarker()}\n__PHYSIQUEOS_REMOTE_EXIT__:0\n`); },
    }).catch((error) => error);
    assert.equal(failure.code, "AUDIT_JSON_MISSING");
    assert.ok(failure.structuralDiagnostics);
    assert.equal(failure.structuralDiagnostics.beginSentinelCount, 0);
    assert.equal(failure.structuralDiagnostics.endSentinelCount, 0);
    assert.equal(failure.structuralDiagnostics.successMarkerCount, 1);
    assert.equal(JSON.stringify(failure.structuralDiagnostics).includes("REMOTE_EXIT"), false);
  });
});

function successfulFetch({ inProgress = null } = {}) {
  return async (url) => {
    if (String(url).includes("api.digitalocean.com")) {
      return response(200, { apps: [{
        id: "app-id",
        spec: { name: "physiqueos-foundation-staging" },
        default_ingress: "https://physiqueos.example",
        in_progress_deployment: inProgress,
        active_deployment: {
          id: "deployment-id",
          phase: "ACTIVE",
          progress: { success_steps: 9, total_steps: 9 },
          services: [{ name: "web", source_commit_hash: SHA }],
          workers: [{ name: "worker", source_commit_hash: SHA }],
        },
      }] });
    }
    return response(200, { status: "ok", buildId: `physiqueos-${SHA.slice(0, 8)}-test` });
  };
}

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function controlPlaneResult() {
  return {
    mode: "control-plane",
    passed: true,
    context: CONTEXT,
    app: { id: "app-id", name: "physiqueos-foundation-staging", ingress: "https://physiqueos.example" },
    deployment: { id: "deployment-id", phase: "ACTIVE", progress: { successSteps: 9, totalSteps: 9 }, inProgress: false },
    components: { web: { name: "web", sourceSha: SHA }, worker: { name: "worker", sourceSha: SHA } },
    health: { status: "ok", buildId: `physiqueos-${SHA.slice(0, 8)}-test` },
  };
}

function doctorFrame({ databaseUrl, deploymentNoise = false }) {
  const prefix = "PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_CONSOLE_JSON";
  const marker = `PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_CONSOLE_OK_${SHA.slice(0, 12)}`;
  const json = JSON.stringify({
    bindingPresence: { databaseUrl, databaseCa: true },
    probe: { selectOne: true },
    runtime: { gitSha: SHA },
    transaction: { readOnly: "on" },
  });
  const encoded = Buffer.from(json).toString("base64");
  return [
    deploymentNoise ? "\u001b[32mweb-host:/workspace#\u001b[0m" : "",
    `__PHYSIQUEOS_STRUCTURED_BEGIN__:${prefix}:${encoded.length}`,
    encoded,
    `__PHYSIQUEOS_STRUCTURED_END__:${prefix}`,
    marker,
    "__PHYSIQUEOS_REMOTE_EXIT__:0",
    "",
  ].filter((line, index) => line || index === 0).join("\r\n");
}

function doctorMarker() {
  return `PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_CONSOLE_OK_${SHA.slice(0, 12)}`;
}
