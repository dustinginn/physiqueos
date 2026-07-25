import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSupplementStrategyManagementService } from "./SupplementStrategyManagementService";
import { resolveProtocolVersionAtDate } from "./ActiveProtocolSuccessorService";

describe("SupplementStrategyManagementService", () => {
  it("creates one root and authoritative V1 atomically and rejects semantic duplicates", async () => {
    const fixture = setup();
    const result = await fixture.service.create(command());
    expect(result).toMatchObject({ outcome: "success", committed: true, protocolId: "supplement_creatine", versionId: "supplement_creatine_v1" });
    expect(fixture.live.protocols.find((item) => item.id === result.protocolId)).toMatchObject({
      currentVersionId: result.versionId, name: "Creatine Monohydrate", status: "active",
    });
    expect(fixture.live.protocolVersions.filter((item) => item.protocolId === result.protocolId)).toHaveLength(1);
    const before = fs.readFileSync(fixture.file, "utf8");
    const duplicate = await fixture.service.create(command({ protocolId: "other", name: " creatine   monohydrate " }));
    expect(duplicate.outcome).toBe("duplicate");
    expect(fs.readFileSync(fixture.file, "utf8")).toBe(before);
  });

  it("rolls back creation failures without a partial root", async () => {
    const fixture = setup({ faults: { afterCreate() { throw new Error("injected"); } } });
    expect((await fixture.service.create(command())).outcome).toBe("persistence_failure");
    expect(fixture.live.protocols).toHaveLength(0);
    expect(fixture.live.protocolVersions).toHaveLength(0);
  });

  it("edits through one successor while retaining identity and historical resolution", async () => {
    const fixture = setup();
    await fixture.service.create(command());
    const result = await fixture.service.edit({
      ...command(),
      expectedCurrentVersionId: "supplement_creatine_v1",
      effectiveDate: "2026-07-26",
      purpose: "Strength support",
      role: "Support high-quality resistance training.",
    });
    expect(result).toMatchObject({ outcome: "success", versionId: "supplement_creatine_v2" });
    expect(fixture.live.protocols).toHaveLength(1);
    expect(fixture.live.protocolVersions).toHaveLength(2);
    expect(resolveProtocolVersionAtDate(fixture.live.protocolVersions, "2026-07-25").id).toBe("supplement_creatine_v1");
    expect(resolveProtocolVersionAtDate(fixture.live.protocolVersions, "2026-07-26").id).toBe("supplement_creatine_v2");
  });

  it("pauses and restores without changing identity or execution data", async () => {
    const fixture = setup();
    await fixture.service.create(command());
    const executionBefore = structuredClone(fixture.live.executionItems);
    expect((await fixture.service.pause({
      protocolId: "supplement_creatine", userId: "founder", expectedCurrentVersionId: "supplement_creatine_v1", effectiveDate: "2026-07-26",
    })).outcome).toBe("success");
    expect(fixture.live.protocols[0].status).toBe("paused");
    expect(fixture.live.protocolVersions.filter((item) => item.status === "active")).toHaveLength(0);
    expect(await fixture.service.restore({
      protocolId: "supplement_creatine", userId: "founder", expectedCurrentVersionId: "supplement_creatine_v1", effectiveDate: "2026-07-27",
      provenance: command().provenance,
    })).toMatchObject({ outcome: "success", versionId: "supplement_creatine_v2" });
    expect(fixture.live.protocols[0]).toMatchObject({ id: "supplement_creatine", status: "active", currentVersionId: "supplement_creatine_v2" });
    expect(fixture.live.executionItems).toEqual(executionBefore);
  });

  it("rejects stale lifecycle commands without writes", async () => {
    const fixture = setup();
    await fixture.service.create(command());
    const before = fs.readFileSync(fixture.file, "utf8");
    const result = await fixture.service.pause({
      protocolId: "supplement_creatine", userId: "founder", expectedCurrentVersionId: "stale", effectiveDate: "2026-07-26",
    });
    expect(result.outcome).toBe("version_conflict");
    expect(fs.readFileSync(fixture.file, "utf8")).toBe(before);
  });
});

function setup({ faults = {} } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "supplement-management-"));
  const file = path.join(directory, "runtime.json");
  const live = {
    version: "test", revision: 0, protocols: [], protocolVersions: [],
    goals: [{ id: "goal-build", userId: "founder", status: "active", title: "Build Lean Mass" }],
    executionItems: [{ id: "execution-creatine", dose: "5 g", active: true }],
  };
  fs.writeFileSync(file, JSON.stringify(live));
  return {
    file, live,
    service: createSupplementStrategyManagementService({
      runtimeStorePath: file, liveStore: live, faults, now: () => new Date("2026-07-25T12:00:00.000Z"),
    }),
  };
}
function command(overrides = {}) {
  return {
    protocolId: "supplement_creatine", userId: "founder", name: "Creatine Monohydrate",
    purpose: "Strength and performance support", role: "Support resistance-training output.",
    goalId: "goal-build", startDate: "2026-07-25", initialStatus: "active",
    provenance: {
      author: { type: "user", id: "founder", displayName: "Founder" },
      reason: "Add supplement strategy.", confirmation: { confirmedByUser: true },
      source: { type: "manual", name: "Founder" }, details: { source: "test" },
    },
    ...overrides,
  };
}
