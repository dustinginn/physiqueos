import fs from "node:fs";
import path from "node:path";
import {
  createTransitionProtocolLineageMigrationService,
} from "../src/domain/services/TransitionProtocolLineageMigrationService.js";
import {
  classifyAllActiveProtocolLineages,
} from "../src/domain/services/ActiveProtocolLineageInvariantService.js";
import {
  createFounderRuntimeFileHash,
  createFounderRuntimeSemanticDigest,
} from "../src/domain/services/FounderRuntimeSemanticDigest.js";

const options = parse(process.argv.slice(2));
const mode = options.mode ?? "audit";
const runtimeStorePath = path.resolve(options.store
  ?? "private/founder/runtime-store.json");
const raw = fs.readFileSync(runtimeStorePath);
const liveStore = JSON.parse(raw);
const baseline = {
  fileHash: createFounderRuntimeFileHash(raw),
  semanticDigest: createFounderRuntimeSemanticDigest(liveStore),
  revision: liveStore.revision ?? 0,
  lastCommitId: liveStore.lastCommitId ?? null,
};
const rootIds = split(options.roots);
const versionIds = split(options.versions);
const service = createTransitionProtocolLineageMigrationService({
  runtimeStorePath,
  liveStore,
});

if (mode === "audit") {
  print({ mode, baseline, classifications: classifyAllActiveProtocolLineages(liveStore) });
  process.exit(0);
}

const command = {
  rootIds,
  expectedVersionIds: versionIds,
  expectedRevision: Number(options.revision),
  expectedSemanticDigest: options.digest,
  reason: options.reason,
  acceptRuntimeMutation: options["accept-runtime-mutation"] === "yes",
  confirmPeptidesExcluded: options["confirm-peptides-excluded"] === "yes",
};
const prepared = service.prepare(command);
if (mode === "dry_run") {
  print({
    mode,
    baseline,
    prepared,
    excludedRoots: classifyAllActiveProtocolLineages(liveStore)
      .filter((item) => item.classification === "versionless_legacy_root")
      .map((item) => item.rootId),
    candidateRevision: prepared.ok ? `${baseline.revision} -> ${baseline.revision + 1}` : null,
  });
  process.exit(prepared.ok ? 0 : 1);
}
if (mode !== "execute") throw new Error(`Unsupported mode: ${mode}`);
if (options["stop-on-conflict"] !== "yes") {
  throw new Error("Execute requires --stop-on-conflict=yes.");
}
const result = await service.execute(command);
print({ mode, baseline, prepared, result });
process.exit(result.committed || result.outcome === "already_migrated" ? 0 : 1);

function parse(args) {
  return Object.fromEntries(args.map((arg) => {
    const [key, ...parts] = arg.replace(/^--/, "").split("=");
    return [key, parts.join("=")];
  }));
}
function split(value) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}
function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
