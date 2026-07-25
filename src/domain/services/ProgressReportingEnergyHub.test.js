import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createProgressReportingService } from "./ProgressReportingService";

describe("Energy Evidence Hub integration", () => {
  it("adds Energy after Activity and before Recovery with a derived latest date", async () => {
    const hub = await createProgressReportingService({
      repositories: FounderRepositories,
    }).getProgressHub();
    const ids = hub.streams.map((stream) => stream.id);
    const energy = hub.streams.find((stream) => stream.id === "energy");

    expect(ids).toEqual([
      "training",
      "nutrition",
      "weight",
      "photos",
      "dexa",
      "activity",
      "energy",
      "recovery",
      "health-metrics",
    ]);
    expect(energy).toMatchObject({
      title: "Energy",
      href: "/progress/energy",
      lastUpdated: "2026-07-24",
      status: "available",
    });
    expect(ids).not.toContain("protocols");
  });
});
