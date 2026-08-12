import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const port = 3103;
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [next, "start", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, PHYSIQUEOS_BUILD_DIST_DIR: ".next-phase3-validation" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

try {
  await waitForReady();
  for (const [route, expected] of [["/", 200], ["/log", 200], ["/goals", 200], ["/profile/operating-plan", 200], ["/api/v1/health/live", 200], ["/api/v1/capabilities", 503]]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { redirect: "manual" });
    if (response.status !== expected) throw new Error(`${route} returned ${response.status}; expected ${expected}.`);
    await response.arrayBuffer();
    process.stdout.write(`[phase3-smoke] ${route} ${response.status}\n`);
  }
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 5_000))]);
}

async function waitForReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Isolated production server exited early.\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Isolated production server did not become ready.\n${output}`);
}
