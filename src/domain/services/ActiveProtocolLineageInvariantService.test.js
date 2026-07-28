import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ActiveProtocolLineageClassification as C,
  classifyActiveProtocolLineage,
  classifyAllActiveProtocolLineages,
} from "./ActiveProtocolLineageInvariantService";

const production = JSON.parse(fs.readFileSync(
  path.resolve("private/founder/runtime-store.json"), "utf8"));

describe("ActiveProtocolLineageInvariantService", () => {
  it("classifies the complete Founder topology without writing", () => {
    const before = fs.readFileSync("private/founder/runtime-store.json");
    const reports = classifyAllActiveProtocolLineages(production);
    expect(reports.filter((item) => item.classification === C.TRANSITION_CANDIDATE))
      .toHaveLength(6);
    expect(reports.filter((item) => item.classification === C.VERSIONLESS_LEGACY_ROOT)
      .map((item) => item.name).sort()).toEqual(["Retatrutide", "Tesamorelin"]);
    expect(reports.filter((item) => item.classification === C.VALID)).toHaveLength(7);
    expect(fs.readFileSync("private/founder/runtime-store.json")).toEqual(before);
  }, 30_000);

  it("uses invariants rather than display names", () => {
    const store = structuredClone(production);
    const report = classifyAllActiveProtocolLineages(store)
      .find((item) => item.classification === C.TRANSITION_CANDIDATE);
    store.protocols.find((item) => item.id === report.rootId).name = "Renamed";
    expect(classifyActiveProtocolLineage(store, report.rootId).classification)
      .toBe(C.TRANSITION_CANDIDATE);
  });

  it.each([
    ["multiple active versions", C.MULTIPLE_ACTIVE_VERSIONS, (store, root, version) => {
      store.protocolVersions.push({ ...version, id: `${version.id}_sibling`, status: "active" });
      version.status = "active";
    }],
    ["cross-root pointer", C.CURRENT_VERSION_CROSS_ROOT, (store, root) => {
      root.currentVersionId = store.protocolVersions.find((item) =>
        item.protocolId !== root.id).id;
    }],
    ["not-active pointer", C.CURRENT_VERSION_NOT_ACTIVE, (store, root, version) => {
      root.currentVersionId = version.id;
    }],
  ])("identifies %s", (_label, expected, mutate) => {
    const store = structuredClone(production);
    const report = classifyAllActiveProtocolLineages(store)
      .find((item) => item.classification === C.TRANSITION_CANDIDATE);
    const root = store.protocols.find((item) => item.id === report.rootId);
    const version = store.protocolVersions.find((item) => item.id === report.candidateVersionId);
    mutate(store, root, version);
    expect(classifyActiveProtocolLineage(store, root).classification).toBe(expected);
  });
});
