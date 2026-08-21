import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coordinator = readFileSync(new URL("./ExternalCombinedCutoverCoordinator.js", import.meta.url), "utf8");
const store = readFileSync(new URL("./PostgresCombinedCutoverCoordinatorStore.js", import.meta.url), "utf8");

describe("external coordinator isolation", () => {
  it("contains no network, PowerShell, filesystem, arbitrary SQL, or generic execution escape hatch", () => {
    expect(coordinator).not.toMatch(/\bfetch\s*\(|exec(?:File)?\s*\(|runCommand|executePowerShell|rawRequest|arbitrary|node:fs|child_process/i);
    expect(coordinator).not.toMatch(/\.query\s*\(|SELECT\s|INSERT\s|UPDATE\s|DELETE\s/i);
  });
  it("keeps SQL confined to the narrow coordinator store", () => {
    expect(store).toContain("combined_cutover_coordinator_runs");
    expect(store).not.toMatch(/combined_runtime_authority|combined_cutover_handoff_receipts|combined_cutover_preparation_receipts|combined_transfer_receipts/);
  });
  it("does not import provider, routing, Windows transport, or canonical repositories", () => {
    const imports = coordinator.split("\n").filter((line) => /^import /.test(line)).join("\n");
    expect(imports).not.toMatch(/DigitalOcean|PowerShell|RoutingControl|Repository|Spaces|PostgresCombinedRuntimeAuthorityStore/);
  });
});
