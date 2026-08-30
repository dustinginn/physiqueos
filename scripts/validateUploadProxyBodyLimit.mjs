import { spawn } from "node:child_process";
import path from "node:path";
import {
  createEvidenceUploadArtifactManifest,
  EVIDENCE_UPLOAD_MANIFEST_FIELD,
} from "../src/domain/services/EvidenceUploadArtifactManifest.js";

const root = process.cwd();
const port = Number(process.env.PHYSIQUEOS_UPLOAD_PROXY_VALIDATION_PORT ?? 3117);
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [next, "start", "-p", String(port)], {
  cwd: root,
  env: {
    ...process.env,
    PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "0",
    PHYSIQUEOS_RUNTIME_STORE_PATH: path.join(root, ".tmp", "upload-proxy-validation-runtime.json"),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });

try {
  await waitForReady();
  const sixMiB = 6 * 1024 * 1024;
  const selected = [
    new File([new Uint8Array(sixMiB)], "front.png", { type: "image/png" }),
    new File([new Uint8Array(sixMiB)], "back.png", { type: "image/png" }),
  ];
  const manifest = createEvidenceUploadArtifactManifest(selected);
  const form = new FormData();
  form.set("evidenceDate", "2026-08-22");
  for (const file of selected) form.append("evidenceFiles", file);
  form.set(EVIDENCE_UPLOAD_MANIFEST_FIELD, JSON.stringify(manifest));

  const response = await fetch(`http://127.0.0.1:${port}/log/upload`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  const responseText = await response.text();
  let result = null;
  try { result = JSON.parse(responseText); } catch {}
  const reachedControlledPostManifestBoundary = response.status === 500 &&
    result?.error === "Your upload could not be prepared for review." &&
    /Migration control is unavailable/.test(output);
  if (!reachedControlledPostManifestBoundary) {
    throw new Error(
      `BUILT_SERVER_UPLOAD_BOUNDARY_UNEXPECTED_${response.status}_${result?.code ?? "NO_CODE"}` +
      `\ncontent-type=${response.headers.get("content-type") ?? "none"}` +
      `\nbody=${responseText.slice(0, 500)}` +
      `\nserver=${output.slice(-3000)}`
    );
  }
  if (/Request body exceeded 10MB|Failed to parse body as FormData/.test(output)) {
    throw new Error(`BUILT_SERVER_UPLOAD_WAS_TRUNCATED\n${output}`);
  }
  process.stdout.write(`${JSON.stringify({
    status: "UPLOAD_PROXY_BODY_LIMIT_PASS",
    requestBytesMinimum: selected.reduce((total, file) => total + file.size, 0),
    fileParts: selected.length,
    manifestEntries: manifest.files.length,
    completenessBoundary: "passed_before_controlled_repository_read_failure",
    jsonErrorPresentation: true,
    truncatedAt10MiB: false,
    configuredCeiling: "50mb",
  })}\n`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

async function waitForReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Built server exited early.\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Built server did not become ready.\n${output}`);
}
