import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { load } from "js-yaml";

const [context, appId, componentName = "web", payloadPath, outputPath] = process.argv.slice(2);
if (!/^[A-Za-z0-9_-]+$/.test(context ?? "")) throw new Error("A safe doctl context name is required.");
if (!/^[0-9a-f-]{36}$/.test(appId ?? "") || !/^[A-Za-z0-9_-]+$/.test(componentName)) {
  throw new Error("A safe app and component identity is required.");
}

const root = path.resolve(import.meta.dirname, "../..");
const resolvedPayload = path.resolve(payloadPath ?? "");
const resolvedOutput = path.resolve(root, outputPath ?? "");
const outputRoot = path.join(root, ".tmp", "performance");
const temporaryRoots = [path.resolve(os.tmpdir()), path.resolve("/private/tmp")];
if (!temporaryRoots.some((temporaryRoot) => resolvedPayload.startsWith(`${temporaryRoot}${path.sep}`)) || path.extname(resolvedPayload) !== ".mjs") {
  throw new Error("Benchmark payload must be an MJS file beneath the system temporary directory.");
}
if (!resolvedOutput.startsWith(`${outputRoot}${path.sep}`) || path.extname(resolvedOutput) !== ".json") {
  throw new Error("Benchmark output must be a JSON file beneath .tmp/performance.");
}

const source = fs.readFileSync(resolvedPayload, "utf8");
const marker = /PHYSIQUEOS_AUDIT_SUCCESS_MARKER: (PHYSIQUEOS_NATIVE_READ_BENCH_OK_[0-9a-f]+)/.exec(source)?.[1];
for (const required of [
  "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  "NON_SELECT_STATEMENT_REFUSED",
  "MULTI_STATEMENT_REFUSED",
  "transaction_read_only",
  "ROLLBACK",
  "COMMANDS_DISABLED",
]) {
  if (!source.includes(required)) throw new Error(`Benchmark payload is missing its ${required} safety gate.`);
}
if (!marker) throw new Error("Benchmark payload is missing its unique success marker.");

const configPaths = [
  path.join(os.homedir(), "Library", "Application Support", "doctl", "config.yaml"),
  path.join(os.homedir(), ".config", "doctl", "config.yaml"),
  path.join(os.homedir(), "AppData", "Roaming", "doctl", "config.yaml"),
];
const configPath = configPaths.find((candidate) => fs.existsSync(candidate));
if (!configPath) throw new Error("The doctl configuration is unavailable.");
const token = load(fs.readFileSync(configPath, "utf8"))?.["auth-contexts"]?.[context];
if (typeof token !== "string" || token.length < 20) throw new Error("Requested doctl context is unavailable.");

const response = await fetch(`https://api.digitalocean.com/v2/apps/${encodeURIComponent(appId)}/components/${encodeURIComponent(componentName)}/exec`, {
  headers: { authorization: `Bearer ${token}`, accept: "application/json" },
});
if (!response.ok) throw new Error(`DigitalOcean exec URL request failed with HTTP ${response.status}.`);
const exec = await response.json();
if (!/^wss:\/\//.test(String(exec.url ?? ""))) throw new Error("DigitalOcean returned an invalid exec URL.");

const encodedSource = gzipSync(Buffer.from(source)).toString("base64");
const chunks = encodedSource.match(/[\s\S]{1,1200}/g) ?? [];
const socket = new WebSocket(exec.url);
let transcript = "";
let started = false;
const timeout = setTimeout(() => socket.close(1000, "bounded timeout"), 360_000);
socket.binaryType = "arraybuffer";
socket.addEventListener("open", () => socket.send(JSON.stringify({ op: "resize", width: 180, height: 50 })));
socket.addEventListener("message", (event) => {
  const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
  let value = raw;
  try { value = String(JSON.parse(raw).data ?? ""); } catch {}
  transcript += value;
  if (value.includes("\u001b[6n")) socket.send(JSON.stringify({ op: "stdin", data: "\u001b[1;1R" }));
  if (!started) { started = true; setTimeout(sendSource, 500); }
});
await new Promise((resolve, reject) => {
  socket.addEventListener("close", resolve);
  socket.addEventListener("error", () => reject(new Error("DigitalOcean exec websocket failed.")));
});
clearTimeout(timeout);

const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const resultText = new RegExp(`(\\{\"gitSha\":[^\\r\\n]+\\})\\r?\\n${escapedMarker}`).exec(transcript)?.[1];
transcript = "";
if (!resultText) throw new Error("The guarded benchmark did not return a parseable success result.");
const result = JSON.parse(resultText);
if (!Array.isArray(result.results) || result.results.some((row) => row.failure)) {
  const failures = Array.isArray(result.results)
    ? result.results.filter((row) => row.failure).map(({ label, failure }) => ({ label, failure }))
    : [{ label: "result", failure: "RESULTS_MISSING" }];
  throw new Error(`The guarded benchmark returned a failed read: ${JSON.stringify(failures)}`);
}
fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${JSON.stringify({
  outputPath: resolvedOutput,
  gitSha: result.gitSha,
  codeLabel: result.codeLabel,
  group: result.group,
  resultCount: result.results.length,
  rows: result.results.map(({ label, coldMs, warmMedianMs, warmP95Ms, warmP99Ms, warmMinMs, warmMaxMs, warmDbMs, warmComputeMs, queries, dbRows, sourceRows, sourcePayloadBytes, maximumPoolWaiting, responseBytes, sourceCollections }) => ({
    label, coldMs, warmMedianMs, warmP95Ms, warmP99Ms, warmMinMs, warmMaxMs, warmDbMs, warmComputeMs, queries, dbRows, sourceRows, sourcePayloadBytes, maximumPoolWaiting, responseBytes, sourceCollections,
  })),
})}\n`);

async function sendSource() {
  const send = (data) => socket.send(JSON.stringify({ op: "stdin", data }));
  send("stty -echo\r");
  await delay(300);
  send("base64 -d <<'PHYSIQUEOS_NATIVE_READ_BENCHMARK' | gzip -d | node --input-type=module\n");
  await delay(150);
  for (const chunk of chunks) {
    send(`${chunk}\n`);
    await delay(40);
  }
  send("PHYSIQUEOS_NATIVE_READ_BENCHMARK\n");
  await delay(150);
  send("stty echo\nexit\n");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
