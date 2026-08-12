import { describe, expect, it } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import {
  CANONICAL_WRITE_ENTRY_POINTS,
  CanonicalWriteDisposition,
  classifyFounderRepositoryMethod,
  listFounderRepositoryMethodInventory,
} from "./canonicalWriteSurfaceInventory.js";

describe("canonical write-surface inventory", () => {
  it("classifies every live Founder repository method with zero unknown paths", () => {
    const repositories = createSeedRepositories({});
    const unknown = [];
    for (const [repositoryName, repository] of Object.entries(repositories)) {
      for (const [methodName, value] of Object.entries(repository)) {
        if (typeof value !== "function") continue;
        try {
          classifyFounderRepositoryMethod(repositoryName, methodName);
        } catch {
          unknown.push(`${repositoryName}.${methodName}`);
        }
      }
    }
    expect(unknown).toEqual([]);
    expect(listFounderRepositoryMethodInventory().some((entry) => entry.disposition === CanonicalWriteDisposition.CANONICAL_WRITE)).toBe(true);
  });

  it("requires interception for every canonical entry point and records migration behavior", () => {
    const canonical = CANONICAL_WRITE_ENTRY_POINTS.filter((entry) => entry.canonical);
    expect(canonical.length).toBeGreaterThan(0);
    expect(canonical.filter((entry) => entry.fenceInterception !== "required-and-implemented")).toEqual([]);
    expect(canonical.filter((entry) => !entry.epochProtection || !entry.migrationBehavior)).toEqual([]);
  });
});
