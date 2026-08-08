import { createFounderStoreMutationLockService } from "../FounderStoreMutationLock.js";

const [, , storePath, mode = "hold", milliseconds = "1000"] = process.argv;
const duration = Number(milliseconds);
const service = createFounderStoreMutationLockService({ storePath,
  defaultMaxHoldMs: Math.max(1000, duration), defaultTimeoutMs: 0 });
const ownership = service.acquireSync({ operation: `subprocess_${mode}`,
  maxHoldMs: Math.max(1000, duration) });
process.stdout.write("ACQUIRED\n");
if (mode === "crash") {
  setTimeout(() => process.exit(17), 10);
} else {
  setTimeout(() => { service.releaseSync(ownership, { outcome: "released" });
    process.exit(0); }, duration);
}
