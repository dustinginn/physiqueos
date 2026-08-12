import process from "node:process";

const options = parseArgs(process.argv.slice(2));
const baseUrl = String(options["base-url"] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const expectedBuildId = options["expected-build-id"] ?? null;
const expectedGitHead = options["expected-git-head"] ?? null;
const repeat = Number(options.repeat ?? 1);

const routes = [
  "/",
  "/log",
  "/log/training",
  "/progress/training",
  "/progress/training/day/2026-08-11",
  "/progress/training/library",
  "/progress/photos",
  "/progress/nutrition",
  "/progress/activity",
  "/progress/weight",
  "/goals",
  "/profile/operating-plan",
  "/profile/protocols",
  "/check-in/morning",
  "/progress/energy",
  "/briefing/daily",
  "/briefings/weekly",
  "/evidence/photos",
  "/evidence/dexa",
  "/profile",
];

const assetPaths = new Set();
let authorizedMediaPath = null;
for (const route of routes) {
  const response = await fetch(`${baseUrl}${route}`);
  assert(response.status === 200, `${route} returned ${response.status}; expected 200.`);
  const type = response.headers.get("content-type") ?? "";
  assert(type.startsWith("text/html"), `${route} returned unexpected content type ${type}.`);
  const html = await response.text();
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const target = decodeHtml(match[1]);
    if (target.startsWith("/_next/static/") && /\.(?:css|js)(?:\?|$)/.test(target)) assetPaths.add(target);
    if (!authorizedMediaPath && target.startsWith("/api/private-evidence/")) authorizedMediaPath = target;
  }
  process.stdout.write(`[phase6-web] ${route} 200 ${type}\n`);
}

assert(assetPaths.size > 0, "Representative pages did not reference any CSS or JavaScript assets.");
for (const assetPath of assetPaths) {
  const response = await fetch(`${baseUrl}${assetPath}`);
  const type = response.headers.get("content-type") ?? "";
  assert(response.status === 200, `${assetPath} returned ${response.status}; expected 200.`);
  if (/\.css(?:\?|$)/.test(assetPath)) assert(/^text\/css(?:;|$)/i.test(type), `${assetPath} returned unexpected content type ${type}.`);
  if (/\.js(?:\?|$)/.test(assetPath)) assert(/^(?:application|text)\/javascript(?:;|$)/i.test(type), `${assetPath} returned unexpected content type ${type}.`);
}
process.stdout.write(`[phase6-web] static assets PASS count=${assetPaths.size}\n`);

if (authorizedMediaPath) {
  const response = await fetch(`${baseUrl}${authorizedMediaPath}`);
  assert(response.status === 200, `${authorizedMediaPath} returned ${response.status}; expected 200.`);
  assert(!(response.headers.get("content-type") ?? "").startsWith("text/html"), "Authorized media returned HTML instead of media bytes.");
  await response.arrayBuffer();
  process.stdout.write(`[phase6-web] authorized media PASS ${authorizedMediaPath}\n`);
} else {
  process.stdout.write("[phase6-web] authorized media not referenced by representative HTML; route authorization remains covered by deterministic tests\n");
}

for (let index = 0; index < repeat; index += 1) {
  for (const route of ["/api/health", "/", "/log"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert(response.status === 200, `${route} repetition ${index + 1} returned ${response.status}.`);
    if (route === "/api/health") {
      const health = await response.json();
      if (expectedBuildId) assert(health.buildId === expectedBuildId, `Health build ${health.buildId} does not match ${expectedBuildId}.`);
      if (expectedGitHead) assert(health.gitHead === expectedGitHead, `Health gitHead ${health.gitHead} does not match ${expectedGitHead}.`);
    } else {
      await response.arrayBuffer();
    }
  }
}

await expectJson("/api/v1/health/live", 200, (body) => body.status === "ok");
await expectJson("/api/v1/health/ready", 503, (body) =>
  body.status === "not_ready"
  && inactive(body, "authentication")
  && inactive(body, "database")
  && inactive(body, "object_storage")
  && inactive(body, "worker"));
await expectJson("/api/v1/capabilities", 503, (body) => body.code === "FOUNDATION_AUTH_INACTIVE");
await expectJson("/api/v1/platform", 503, (body) => body.code === "FOUNDATION_AUTH_INACTIVE");

process.stdout.write(`[phase6-web] PASS ${JSON.stringify({ baseUrl, routeCount: routes.length, assetCount: assetPaths.size, repeat, expectedBuildId, expectedGitHead })}\n`);

async function expectJson(route, status, predicate) {
  const response = await fetch(`${baseUrl}${route}`);
  const body = await response.json();
  assert(response.status === status, `${route} returned ${response.status}; expected ${status}.`);
  assert(predicate(body), `${route} returned an unexpected compatibility model.`);
  process.stdout.write(`[phase6-web] ${route} ${status}\n`);
}

function inactive(body, name) {
  return body.checks?.some((check) => check.name === name && check.ready === false && /_INACTIVE$/.test(check.code));
}

function parseArgs(args) {
  return Object.fromEntries(args.map((argument) => {
    const match = argument.match(/^--([^=]+)=(.*)$/);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    return [match[1], match[2]];
  }));
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
