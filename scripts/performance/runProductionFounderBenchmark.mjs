import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { load } from "js-yaml";

const [context, appId, componentName = "web", batch = "core", outputPath = null] = process.argv.slice(2);
if (!/^[A-Za-z0-9_-]+$/.test(context ?? "")) throw new Error("A safe doctl context name is required.");
if (!/^[0-9a-f-]{36}$/.test(appId ?? "") || !/^[A-Za-z0-9_-]+$/.test(componentName)) throw new Error("A safe app and component identity is required.");
if (!/^(?:core|training-reports|training-library|evidence|nutrition-landing|nutrition-primary|nutrition-secondary|nutrition-secondary-reports|nutrition-library|evidence-verticals|ancillary-evidence|media|ingress|details|details-home|details-training|details-evidence|details-briefings|details-profile)$/.test(batch)) throw new Error("A supported benchmark batch is required.");

const root = path.resolve(import.meta.dirname, "../..");
const inventory = fs.readFileSync(path.join(root, "scripts/performance/founderSurfaceInventory.mjs"), "utf8");
const benchmark = fs.readFileSync(path.join(root, "scripts/performance/productionFounderBenchmark.mjs"), "utf8")
  .replace('from "./founderSurfaceInventory.mjs";', `from "data:text/javascript;base64,${Buffer.from(inventory).toString("base64")}";`)
  .replace("__BENCHMARK_BATCH__", batch);
const encodedSource = gzipSync(Buffer.from(benchmark)).toString("base64");
const config = load(fs.readFileSync(path.join(os.homedir(), "AppData", "Roaming", "doctl", "config.yaml"), "utf8"));
const token = config?.["auth-contexts"]?.[context];
if (typeof token !== "string" || token.length < 20) throw new Error("Requested doctl context is unavailable.");

const response = await fetch(`https://api.digitalocean.com/v2/apps/${encodeURIComponent(appId)}/components/${encodeURIComponent(componentName)}/exec`, {
  headers: { authorization: `Bearer ${token}`, accept: "application/json" },
});
if (!response.ok) throw new Error(`DigitalOcean exec URL request failed with HTTP ${response.status}.`);
const payload = await response.json();
if (!/^wss:\/\//.test(String(payload.url ?? ""))) throw new Error("DigitalOcean returned an invalid exec URL.");

const chunks = encodedSource.match(/[\s\S]{1,1200}/g) ?? [];
const socket = new WebSocket(payload.url);
let output = "";
let started = false;
const timeout = setTimeout(() => socket.close(1000, "bounded timeout"), 900_000);
socket.binaryType = "arraybuffer";
socket.addEventListener("open", () => socket.send(JSON.stringify({ op: "resize", width: 160, height: 50 })));
socket.addEventListener("message", (event) => {
  const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
  let value = raw;
  try { value = String(JSON.parse(raw).data ?? ""); } catch {}
  output += value;
  if (value.includes("\u001b[6n")) socket.send(JSON.stringify({ op: "stdin", data: "\u001b[1;1R" }));
  if (!started) { started = true; setTimeout(sendSource, 1_500); }
});
await new Promise((resolve, reject) => {
  socket.addEventListener("close", resolve);
  socket.addEventListener("error", () => reject(new Error("DigitalOcean exec websocket failed.")));
});
clearTimeout(timeout);
const marker = /PHYSIQUEOS_PERF_BEGIN([A-Za-z0-9+/=\r\n]+?)PHYSIQUEOS_PERF_END/.exec(output)?.[1]?.replaceAll(/\s/g, "");
if (!marker) {
  const diagnostic = safeDiagnostic(output);
  output = "";
  throw new Error(`Production performance benchmark result marker was not returned: ${diagnostic}`);
}
output = "";
const decoded = Buffer.from(marker, "base64").toString("utf8");
if (outputPath) {
  const outputRoot = path.join(root, ".tmp", "performance");
  const resolvedOutput = path.resolve(root, outputPath);
  if (!resolvedOutput.startsWith(`${outputRoot}${path.sep}`) || path.extname(resolvedOutput) !== ".json") {
    throw new Error("Benchmark output must be a JSON file beneath .tmp/performance.");
  }
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${decoded}\n`, { encoding: "utf8", flag: "wx" });
  const parsed = JSON.parse(decoded);
  process.stdout.write(`${JSON.stringify({ outputPath: resolvedOutput, batch: parsed.batch, sourceCommit: parsed.sourceCommit, direct: { measuredSurfaceCount: parsed.direct.measuredSurfaceCount, failuresAbove3Seconds: parsed.direct.failuresAbove3Seconds, classificationCounts: parsed.direct.classificationCounts, slowest: parsed.direct.slowest.slice(0, 10) }, media: parsed.media, ngrok: { measuredSurfaceCount: parsed.ngrok.measuredSurfaceCount, failuresAbove3Seconds: parsed.ngrok.failuresAbove3Seconds }, productionMutationPerformed: parsed.productionMutationPerformed })}\n`);
} else {
  process.stdout.write(`${decoded}\n`);
}

async function sendSource() {
  const send = (data) => socket.send(JSON.stringify({ op: "stdin", data }));
  send("stty -echo\r");
  await delay(500);
  send("base64 -d <<'PHYSIQUEOS_PERFORMANCE_SOURCE' | gzip -d | node --input-type=module\n");
  await delay(250);
  for (const chunk of chunks) {
    send(`${chunk}\n`);
    await delay(100);
  }
  send("PHYSIQUEOS_PERFORMANCE_SOURCE\n");
  await delay(250);
  send("stty echo\nexit\n");
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function safeDiagnostic(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[DATABASE_URL_REDACTED]")
    .replace(/[A-Za-z0-9+/=]{48,}/g, "[LONG_VALUE_REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(-1_000);
}
