import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const port = 3106;
const distDirectory = process.env.PHYSIQUEOS_BUILD_DIST_DIR ?? ".next-phase6-validation";
const distPath = path.resolve(root, distDirectory);
if (path.dirname(distPath) !== path.resolve(root)) throw new Error("Phase 6 build path escaped the repository.");
const buildId = fs.readFileSync(path.join(distPath, "BUILD_ID"), "utf8").trim();
const gitHead = run("git", ["rev-parse", "HEAD"]).trim();
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const env = {
  ...process.env,
  PHYSIQUEOS_BUILD_DIST_DIR: distDirectory,
  PHYSIQUEOS_PHASE2_STAGING_ENABLED: "0",
  PHYSIQUEOS_DATABASE_ENABLED: "0",
  PHYSIQUEOS_OBJECT_STORAGE_ENABLED: "0",
};
const child = spawn(process.execPath, [next, "start", "-p", String(port)], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

try {
  await waitForReady(buildId);
  const result = spawnSync(process.execPath, [
    "scripts/validatePhase6WebSurface.mjs",
    `--base-url=http://127.0.0.1:${port}`,
    `--expected-build-id=${buildId}`,
    `--expected-git-head=${gitHead}`,
    "--repeat=2",
  ], { cwd: root, env, stdio: "inherit", windowsHide: true, timeout: 180_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Phase 6 web validation failed with exit code ${result.status}.`);
  process.stdout.write(`[phase6-smoke] PASS ${JSON.stringify({ buildId, gitHead, port, distDirectory })}\n`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

async function waitForReady(expectedBuildId) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Isolated Phase 6 server exited early.\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.status === 200 && (await response.json()).buildId === expectedBuildId) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Isolated Phase 6 server did not expose build ${expectedBuildId}.\n${output}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}
