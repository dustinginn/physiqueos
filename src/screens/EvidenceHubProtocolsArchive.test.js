import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../data/repositories/founderRepositories";
import { createProgressReportingService } from "../domain/services/ProgressReportingService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Evidence Hub Protocols archive", () => {
  it("removes Protocols only from the visible Evidence Hub model", async () => {
    const before = fs.readFileSync(storePath);
    const service = createProgressReportingService({
      repositories: FounderRepositories,
    });
    const hub = await service.getProgressHub();
    const protocols = await service.getPlaceholderReport("protocols");

    expect(hub.streams.map((stream) => stream.id)).toEqual([
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
    expect(hub.streams).toHaveLength(9);
    expect(protocols).toMatchObject({
      id: "protocols",
      title: "Protocols",
    });
    expect(fs.readFileSync(storePath)).toEqual(before);
  }, 30000);

  it("keeps direct Protocol and goal-transition route files intact", () => {
    for (const route of [
      "src/app/progress/[stream]/page.js",
      "src/app/profile/protocols/page.js",
      "src/app/profile/protocols/[protocolId]/page.js",
      "src/app/profile/protocols/[protocolId]/edit/page.js",
      "src/app/goals/transition/protocols/page.js",
      "src/app/goals/transition/protocols/edit/[category]/page.js",
    ]) {
      expect(fs.existsSync(path.resolve(process.cwd(), route)), route).toBe(true);
    }
  });
});
